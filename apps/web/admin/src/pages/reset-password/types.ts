export interface ResetPasswordFormValues {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordViewProps {
  initialToken?: string;
  loading?: boolean;
  onSubmit: (values: { reset_token: string; new_password: string }) => Promise<void>;
  onBackToLogin: () => void;
}
