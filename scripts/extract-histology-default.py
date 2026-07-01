import argparse
import json
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter


QUESTION_COLOR = (0.917647, 0.956863, 0.984314)
ANSWER_COLOR = (0.117647, 0.517647, 0.286275)
ANSWER_OVERRIDES = {
    163: "B",
}


def close_color(value, expected, tolerance=0.01):
    return isinstance(value, (tuple, list)) and len(value) == 3 and all(
        abs(float(actual) - target) <= tolerance
        for actual, target in zip(value, expected)
    )


def row_text(page, row):
    text = page.crop((row["x0"], row["top"], row["x1"], row["bottom"])).extract_text() or ""
    return re.sub(r"\s+", " ", text).strip()


def content_rows(page):
    return sorted(
        (
            row
            for row in page.rects
            if 40 <= row["x0"] <= 45
            and 550 <= row["x1"] <= 555
            and row["top"] >= 55
            and row["bottom"] <= 790
            and (
                close_color(row.get("non_stroking_color"), QUESTION_COLOR)
                or close_color(row.get("non_stroking_color"), ANSWER_COLOR)
                or close_color(row.get("non_stroking_color"), (1.0, 1.0, 1.0))
            )
        ),
        key=lambda row: (row["top"], row["x0"]),
    )


def extract_questions(source):
    questions = []
    current = None

    with pdfplumber.open(source) as pdf:
        for page_number, page in enumerate(pdf.pages[2:], start=3):
            for row in content_rows(page):
                text = row_text(page, row)
                question_match = re.match(r"^Q(\d+)\.\s*(.+)$", text)
                if question_match:
                    if current:
                        questions.append(current)
                    current = {
                        "sourceNumber": int(question_match.group(1)),
                        "questionText": question_match.group(2).strip(),
                        "options": {},
                        "greenAnswers": [],
                        "sourcePage": page_number,
                        "sourceCorrections": [],
                    }
                    continue

                if not current:
                    continue

                cleaned = re.sub(r"^\d+\s+(?=[A-F][).])", "", text)
                option_match = re.match(r"^([A-F])[).]\s*(.+)$", cleaned)
                if not option_match:
                    raise ValueError(f"Unrecognized row on page {page_number}: {text!r}")

                source_letter, option_text = option_match.groups()
                expected_letter = chr(ord("A") + len(current["options"]))
                letter = source_letter
                if source_letter in current["options"] or source_letter != expected_letter:
                    letter = expected_letter
                    current["sourceCorrections"].append(
                        f"Normalized duplicate/out-of-sequence option {source_letter} to {letter}."
                    )
                if letter in current["options"]:
                    current["options"][letter] = f'{current["options"][letter]} {option_text}'.strip()
                else:
                    current["options"][letter] = option_text.strip()

                if close_color(row.get("non_stroking_color"), ANSWER_COLOR):
                    current["greenAnswers"].append(letter)

    if current:
        questions.append(current)

    return questions


def validate_questions(questions):
    if len(questions) != 450:
        raise ValueError(f"Expected 450 questions, extracted {len(questions)}.")

    expected_numbers = list(range(1, 451))
    actual_numbers = [question["sourceNumber"] for question in questions]
    if actual_numbers != expected_numbers:
        raise ValueError("Question numbering is not continuous from Q1 through Q450.")

    for question in questions:
        number = question["sourceNumber"]
        question["correctAnswer"] = ANSWER_OVERRIDES.get(
            number,
            question["greenAnswers"][0] if len(question["greenAnswers"]) == 1 else "",
        )
        if not question["questionText"]:
            raise ValueError(f"Q{number} has no question text.")
        if len(question["options"]) < 3:
            raise ValueError(f"Q{number} has fewer than three choices.")
        if question["correctAnswer"] not in question["options"]:
            raise ValueError(
                f'Q{number} has invalid green answers: {question["greenAnswers"]}.'
            )
        if len(question["greenAnswers"]) != 1 and number not in ANSWER_OVERRIDES:
            raise ValueError(
                f'Q{number} has multiple green answers without an override: {question["greenAnswers"]}.'
            )


def build_seed(questions):
    seed_questions = []
    for question in questions:
        options = {
            letter: question["options"].get(letter, "")
            for letter in ("A", "B", "C", "D", "E", "F")
        }
        seed_questions.append(
            {
                "questionText": question["questionText"],
                "options": options,
                "questionNumber": question["sourceNumber"],
                "correctAnswer": question["correctAnswer"],
                "explanation": "",
                "status": "ready",
                "confidence": 0.99,
                "extractionNote": (
                    "Default Histology question extracted from source page "
                    f'{question["sourcePage"]}; correct answer detected from the green row.'
                    + (
                        " Source correction: " + " ".join(question["sourceCorrections"])
                        if question["sourceCorrections"]
                        else ""
                    )
                    + (
                        f' Correct answer normalized to {question["correctAnswer"]} after visual review.'
                        if question["sourceNumber"] in ANSWER_OVERRIDES
                        else ""
                    )
                ),
            }
        )

    return {
        "defaultKey": "histology-osh-2025-2026",
        "version": "2026-07-01-v1",
        "fileName": "Histology Answer Key OSH 2025-2026.pdf",
        "fileUrl": "/default-pdfs/histology-osh-2025-2026.pdf",
        "storagePath": "default-pdfs/histology-osh-2025-2026.pdf",
        "semesterId": "semester-2",
        "semesterName": "Semester 2",
        "subjectId": "histology",
        "subjectName": "Histology",
        "questions": seed_questions,
    }


def trim_pdf(source, destination):
    reader = PdfReader(source)
    writer = PdfWriter()
    for page in reader.pages[2:]:
        writer.add_page(page)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        writer.write(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--json", required=True, type=Path)
    parser.add_argument("--pdf", required=True, type=Path)
    args = parser.parse_args()

    questions = extract_questions(args.source)
    validate_questions(questions)
    seed = build_seed(questions)

    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    trim_pdf(args.source, args.pdf)

    answer_counts = {
        letter: sum(question["correctAnswer"] == letter for question in questions)
        for letter in ("A", "B", "C", "D", "E", "F")
    }
    print(
        json.dumps(
            {
                "questions": len(questions),
                "first": questions[0]["sourceNumber"],
                "last": questions[-1]["sourceNumber"],
                "answerCounts": answer_counts,
                "optionCounts": {
                    str(count): sum(len(question["options"]) == count for question in questions)
                    for count in sorted({len(question["options"]) for question in questions})
                },
                "sourceCorrections": [
                    question["sourceNumber"]
                    for question in questions
                    if question["sourceCorrections"] or question["sourceNumber"] in ANSWER_OVERRIDES
                ],
                "json": str(args.json),
                "pdf": str(args.pdf),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
