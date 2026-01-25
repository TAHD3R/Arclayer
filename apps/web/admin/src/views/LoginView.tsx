import { Button, Card, Form, Input, Typography } from "antd";

export interface LoginFormValues {
  username: string;
  password: string;
}

export interface LoginViewProps {
  onSubmit: (values: LoginFormValues) => void;
}

export function LoginView({ onSubmit }: LoginViewProps) {
  return (
    <Card style={{ maxWidth: 420 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Login
      </Typography.Title>
      <Form<LoginFormValues> layout="vertical" onFinish={onSubmit}>
        <Form.Item<LoginFormValues>
          label="Username"
          name="username"
          rules={[{ required: true, message: "Please enter your username." }]}
        >
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item<LoginFormValues>
          label="Password"
          name="password"
          rules={[{ required: true, message: "Please enter your password." }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          Sign in
        </Button>
      </Form>
    </Card>
  );
}
