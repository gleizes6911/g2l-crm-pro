import type { ZodIssue } from "zod";

export function formatZodIssues(issues: ZodIssue[]): Record<string, string> {
  return issues.reduce<Record<string, string>>((acc, issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    if (!acc[path]) {
      acc[path] = issue.message;
    }
    return acc;
  }, {});
}
