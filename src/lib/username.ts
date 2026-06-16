export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; message: string };

const USERNAME_PATTERN = /^[a-z0-9_-]{2,24}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): UsernameValidation {
  const username = normalizeUsername(value);

  if (username.length === 0) {
    return { ok: false, message: "Enter a username." };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      message: "Use 2-24 letters, numbers, underscores, or hyphens."
    };
  }

  return { ok: true, username };
}
