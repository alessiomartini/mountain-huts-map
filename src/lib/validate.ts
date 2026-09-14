import { z } from 'zod';
import { HutSchema, type Hut } from './hut-schema.ts';

export interface ValidationIssue {
  index: number;
  id: string | undefined;
  issues: string[];
}

export interface ValidationResult {
  valid: Hut[];
  errors: ValidationIssue[];
}

export function validateHuts(records: unknown[]): ValidationResult {
  const valid: Hut[] = [];
  const errors: ValidationIssue[] = [];

  records.forEach((record, index) => {
    const result = HutSchema.safeParse(record);
    if (result.success) {
      valid.push(result.data);
    } else {
      const id =
        typeof record === 'object' && record !== null && 'id' in record
          ? String((record as { id: unknown }).id)
          : undefined;
      errors.push({ index, id, issues: formatIssues(result.error) });
    }
  });

  return { valid, errors };
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}
