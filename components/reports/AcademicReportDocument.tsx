import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type ReportReviewItem = {
  number: number;
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  status: string;
};

export type AcademicReportData = {
  title: string;
  subtitle?: string;
  studentName: string;
  studentEmail: string;
  profilePhotoUrl?: string;
  generatedAt: string;
  summary: Array<{ label: string; value: string }>;
  sections: Array<{
    title: string;
    rows: Array<{ label: string; value: string; secondary?: string }>;
  }>;
  review?: ReportReviewItem[];
};

const styles = StyleSheet.create({
  page: { paddingTop: 92, paddingBottom: 48, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9, color: "#162033" },
  header: { position: "absolute", top: 24, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#0ea5a4", paddingBottom: 12 },
  brand: { fontSize: 18, fontWeight: 700 },
  title: { fontSize: 20, fontWeight: 700 },
  subtitle: { marginTop: 5, fontSize: 10, color: "#526174" },
  student: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#162033" },
  avatarFallback: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#162033", color: "#ffffff", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  studentName: { fontWeight: 700, fontSize: 10 },
  muted: { color: "#667085", marginTop: 2 },
  summaryGrid: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryItem: { width: "31.8%", minHeight: 46, borderWidth: 1, borderColor: "#dbe3ea", padding: 9, backgroundColor: "#f8fafc" },
  summaryLabel: { color: "#667085", fontSize: 8 },
  summaryValue: { marginTop: 5, fontWeight: 700, fontSize: 12 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#dbe3ea" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e8edf2", paddingVertical: 7, paddingHorizontal: 8 },
  rowLast: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8 },
  rowLabel: { width: "38%", fontWeight: 700, paddingRight: 8 },
  rowValue: { width: "62%" },
  rowSecondary: { marginTop: 2, color: "#667085", fontSize: 8 },
  reviewItem: { marginTop: 10, borderWidth: 1, borderColor: "#dbe3ea", padding: 10 },
  reviewQuestion: { fontWeight: 700, lineHeight: 1.4 },
  reviewStatus: { marginTop: 6, fontWeight: 700 },
  reviewAnswer: { marginTop: 4, lineHeight: 1.35 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 24, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#dbe3ea", paddingTop: 7, color: "#667085", fontSize: 8 }
});

export function AcademicReportDocument({ data }: { data: AcademicReportData }) {
  const initials = data.studentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "PL";
  return (
    <Document title={data.title} author="PadLEI">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>PadLEI</Text>
            <Text style={styles.muted}>Academic Performance Report</Text>
          </View>
          <View style={styles.student}>
            {data.profilePhotoUrl ? <Image style={styles.avatar} src={data.profilePhotoUrl} /> : <View style={styles.avatarFallback}><Text>{initials}</Text></View>}
            <View>
              <Text style={styles.studentName}>{data.studentName}</Text>
              <Text style={styles.muted}>{data.studentEmail}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title}>{data.title}</Text>
        {data.subtitle ? <Text style={styles.subtitle}>{data.subtitle}</Text> : null}

        <View style={styles.summaryGrid}>
          {data.summary.map((item) => (
            <View key={`${item.label}_${item.value}`} style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{item.label}</Text>
              <Text style={styles.summaryValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {data.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.table}>
              {section.rows.map((row, index) => (
                <View key={`${row.label}_${index}`} style={index === section.rows.length - 1 ? styles.rowLast : styles.row} wrap={false}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <View style={styles.rowValue}>
                    <Text>{row.value}</Text>
                    {row.secondary ? <Text style={styles.rowSecondary}>{row.secondary}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        {data.review?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Question-by-question review</Text>
            {data.review.map((item) => (
              <View key={item.number} style={styles.reviewItem} wrap={false}>
                <Text style={styles.reviewQuestion}>Q{item.number}. {item.question}</Text>
                <Text style={styles.reviewStatus}>Result: {item.status}</Text>
                <Text style={styles.reviewAnswer}>Selected answer: {item.selectedAnswer || "Unattempted"}</Text>
                <Text style={styles.reviewAnswer}>Correct answer: {item.correctAnswer}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>Generated {data.generatedAt}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
