import { projectSchema, layoutIssues, type Issue } from './model.js';
import { fontIssues } from './fonts.js';
export function validate(input:unknown):Issue[] {
  const result=projectSchema.safeParse(input);
  if(!result.success) return result.error.issues.map(i=>({severity:'error',code:'SCHEMA',message:`${i.path.join('.')}: ${i.message}`}));
  return [...layoutIssues(result.data),...fontIssues(result.data)];
}
