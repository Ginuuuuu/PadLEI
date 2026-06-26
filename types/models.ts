export type UserRole = "user" | "admin";
export type PdfStatus = "uploaded" | "extracting" | "completed" | "failed";
export type QuestionStatus = "ready" | "needsReview" | "needs_review" | "failed";
export type PdfStorageProvider = "cloudinary" | "firebase" | "local";
export type OptionKey = "A" | "B" | "C" | "D" | "E" | "F";

export type QuestionDiagram = {
  id: string;
  src: string;
  alt: string;
  pageNumber?: number;
  width?: number;
  height?: number;
};

export type AppUser = {
  uid: string;
  email: string;
  name?: string;
  role: UserRole;
  approved: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type UserApproval = {
  email: string;
  role: UserRole;
  approved: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type PdfFile = {
  pdfId: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  bucketName?: string;
  storageProvider?: PdfStorageProvider;
  uploadedAt: string;
  status: PdfStatus;
  totalQuestions: number;
  readyQuestions?: number;
  needsReviewQuestions?: number;
  errorMessage?: string;
};

export type Question = {
  id: string;
  questionId?: string;
  pdfId: string;
  userId: string;
  questionNumber: number;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
    F?: string;
  };
  diagrams?: QuestionDiagram[];
  correctAnswer: OptionKey | "";
  explanation?: string;
  status: QuestionStatus;
  confidence?: number;
  extractionNote?: string;
};

export type LoginRequestStatus = "pending" | "approved" | "rejected";

export type LoginRequest = {
  requestId: string;
  fullName: string;
  gmail: string;
  preferredPassword: string;
  requestedRole: "user";
  status: LoginRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type ExamSettings = {
  pdfId: string;
  pdfName: string;
  questionCount: number;
  fromQuestion: number;
  toQuestion: number;
  order: "random" | "sequential";
  shuffleChoices?: boolean;
  timerMinutes?: number;
  marksPerCorrect: number;
  negativeMarks: boolean;
  negativeValue: number;
};

export type ExamAnswer = {
  questionId: string;
  selectedAnswer: string;
  selectedDisplayAnswer?: string;
  selectedAnswerText?: string;
  correctAnswer: string;
  correctDisplayAnswer?: string;
  correctAnswerText?: string;
  isCorrect: boolean;
  markedForReview: boolean;
};

export type ExamResult = {
  resultId: string;
  userId: string;
  pdfId: string;
  pdfName: string;
  date: string;
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  unattempted: number;
  marks: number;
  percentage: number;
  timeTaken: number;
  answers: ExamAnswer[];
  questions: Question[];
};

export type Quote = {
  quoteId: string;
  userId?: string;
  text: string;
  author?: string;
  type: "default" | "custom";
};

export type Progress = {
  userId: string;
  pdfId: string;
  studiedQuestions: string[];
  learnedQuestions: string[];
  bookmarkedQuestions: string[];
  weakQuestions: string[];
  bestScore: number;
  averageScore: number;
};
