export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;

export function assertPassword(value: string): void {
  const length = [...value].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Vault password must contain ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`);
  }
}
