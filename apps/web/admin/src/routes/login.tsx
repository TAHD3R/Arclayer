import { createFileRoute } from "@tanstack/react-router";
import { Button, Card, Form, Input, Typography } from "antd";

import { useAuthStore } from "@/stores/auth.store";

interface LoginFormValues {
  username: string;
  password: string;
}

function LoginPage() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  const onFinish = (values: LoginFormValues) => {
    // Placeholder: replace with real API call + token persistence.
    // Keep it simple so the base scaffold stays usable without backend wiring.
    setAccessToken(`${values.username}:dummy-token`);
  };

  return (
    <Card style={{ maxWidth: 420 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Login
      </Typography.Title>
      <Form<LoginFormValues> layout="vertical" onFinish={onFinish}>
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

export const Route = createFileRoute("/login")({
  component: LoginPage,
});
