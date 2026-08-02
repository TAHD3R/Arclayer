export interface ResetPasswordFormValues {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordViewProps {
  initialToken?: string;
  loading?: boolean;
  onSubmit: (values: { resetToken: string; newPassword: string }) => Promise<void>;
  onBackToLogin: () => void;
}
