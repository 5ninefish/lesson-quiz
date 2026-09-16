import type { RawWorkbook } from "../workbook/snapshot";

/** Sanitized reproduction of the 2026-09-15 inspected shapes. No real people. */
export function observedWorkbook(): RawWorkbook {
  const blankStudent = ["", "", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
  const students: RawWorkbook["students"] = [
    ["Username", "PasswordHash", "L1", "L2", "L3", "L4", "L5", "L6", "CycleL1", "CycleL2", "CycleL3", "CycleL4", "CycleL5", "CycleL6"],
    ["student.one@example.edu", "", 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    ["student.two@example.edu", "", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    ["student.three@example.edu", "", 2, 1, 0, 0, 0, 0, "", 1, 1, 1, 1, 1],
    ["student.four@example.edu", "", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    ["student.five@example.edu", "", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    ["student.one@example.edu", "", 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
  ];
  for (let i = 0; i < 8; i++) students.push([...blankStudent]);

  const questions: RawWorkbook["questions"] = [
    ["Lesson", "Q#", "Question", "A", "B", "C", "D", "E", "F"],
  ];
  const lessons = ["L1", "L2", "L3", "L4", "L5", "L6"];
  for (const lesson of lessons) {
    for (let q = 1; q <= 5; q++) {
      questions.push([lesson, String(q), `${lesson} prompt ${q}`, "A1", "B1", "C1", "D1", "", ""]);
    }
  }

  const releases: RawWorkbook["releases"] = [
    ["TestId", "Strand", "Title", "OpenAt", "CloseAt", "Manual", "MaxTries", "TimeLimitSec"],
    ["SCI-SOIL", "Science", "Soil — Science Lesson 1", "", "", "UNSET", 2, 0],
    ["SCI-CORAL", "Science", "3D Printing & Coral — Science Lesson 2", "", "", "OPEN", 2, 0],
    ["SCI-CS", "Science", "Computer Science — Science Lesson 3", "", "", "CLOSED", 2, 1800],
    ["SCI-ASTRO", "Science", "Astronomy — Science Lesson 4", "2026-09-20T18:00:00-10:00", "2026-09-27T18:00:00-10:00", "AUTO", 2, 0],
    ["SCI-HEALTH", "Science", "Health — Science Lesson 5", "", "", "AUTO", 2, 0],
    ["SCI-DM", "Science", "Digital Media — Science Lesson 6", "", "", "UNSET", 2, 0],
  ];

  const attempts: RawWorkbook["attempts"] = [
    [
      "Username",
      "TestId",
      "Cycle",
      "SubmissionId",
      "StartedAt",
      "TimeLimitSec",
      "MaxTriesSnapshot",
      "QuestionFingerprint",
      "CorrectSnapshot",
      "Status",
      "QuestionsSnapshot",
    ],
  ];

  const results: RawWorkbook["results"] = [
    [
      "2026-09-15T18:04:00-10:00",
      "student.one@example.edu",
      "L1",
      1,
      "4/5",
      "A",
      "B",
      "C",
      "A",
      "B",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Cycle",
      "LifetimeSeq",
      "SubmissionId",
      "Status",
      "Complete",
    ],
    ["2026-07-01T10:00:00-10:00", "student.three@example.edu", "L1", 1, "10/14", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B"],
    ["2026-09-10T09:00:00-10:00", "student.two@example.edu", "L2", 1, "2/5", "A", "B", "", "", ""],
    ["2026-09-11T09:00:00-10:00", "student.two@example.edu", "SCI-CORAL", 2, "5/5", "A", "B", "C", "D", "A"],
    ["2026-09-12T09:00:00-10:00", "ghost@example.edu", "L4", 1, "5/5", "A", "B", "C", "D", "A"],
    ["2026-09-13T09:00:00-10:00", "student.four@example.edu", "NOPE", 1, "1/5", "A", "B", "C", "D", "E"],
    ["2026-09-14T09:00:00-10:00", "student.five@example.edu", "L3", 1, "5/5", "A", "B", "C", "D", "A"],
    ["2026-09-15T12:00:00-10:00", "student.one@example.edu", "L1", 2, "5/5", "A", "B", "C", "D", "A"],
  ];

  const audit: RawWorkbook["audit"] = [["TimestampHST", "Actor", "Action", "Detail"]];

  return { students, questions, releases, attempts, results, audit };
}
