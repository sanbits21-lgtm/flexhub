// The checks a change-password form can do before asking the server. The server has the final word (it also refuses easy
// passwords such as common words or ones containing your name), so this only catches the plain mistakes early.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

/** Returns a short message for the first problem, or null when the form is fine to send. */
export const passwordFormProblem = ({ current = '', next = '', confirm = '' }) => {
  if (!current) return 'Enter your current password.';
  if (next.length < MIN_PASSWORD) return `The new password must be at least ${MIN_PASSWORD} characters.`;
  if (next.length > MAX_PASSWORD) return `The new password must be ${MAX_PASSWORD} characters or fewer.`;
  if (next === current) return 'The new password must be different from the current one.';
  if (next !== confirm) return 'The two new passwords do not match.';
  return null;
};
