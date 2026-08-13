import { describe, expect, it } from "vitest";

import { ApiError } from "@arclayer/web/http";

import {
  getAuthValidationDetails,
  getPasswordRequirementStates,
  PASSWORD_PATTERN,
  resolveAuthFormError,
} from "@/lib/auth/form-feedback";

const t = (key: string) => key;

describe("password form feedback", () => {
  it("tracks each password requirement independently", () => {
    expect(getPasswordRequirementStates("short", t)).toEqual([
      { key: "length", label: "auth:PASSWORD_REQUIREMENT_LENGTH", met: false },
      { key: "lowercase", label: "auth:PASSWORD_REQUIREMENT_LOWERCASE", met: true },
      { key: "uppercase", label: "auth:PASSWORD_REQUIREMENT_UPPERCASE", met: false },
      { key: "number", label: "auth:PASSWORD_REQUIREMENT_NUMBER", met: false },
    ]);
  });

  it("requires uppercase, lowercase, and number characters", () => {
    expect(PASSWORD_PATTERN.test("lowercase123")).toBe(false);
    expect(PASSWORD_PATTERN.test("UPPERCASE123")).toBe(false);
    expect(PASSWORD_PATTERN.test("Password")).toBe(false);
    expect(PASSWORD_PATTERN.test("Password1")).toBe(true);
  });
});

describe("auth form validation feedback", () => {
  it("returns structured validation details without parsing localized text", () => {
    const error = validationError();

    expect(getAuthValidationDetails(error)).toEqual([
      {
        code: "PASSWORD_INVALID",
        field: "password",
        message: "具体密码规则",
      },
    ]);
    expect(resolveAuthFormError(error, "fallback")).toBe("具体密码规则");
  });

  it("falls back when validation metadata is missing or malformed", () => {
    expect(
      resolveAuthFormError(
        new ApiError({
          status: 422,
          message: "参数校验失败",
          error: "VALIDATION_ERROR",
          meta: { details: [{ loc: ["body", "password"] }] },
        }),
        "fallback",
      ),
    ).toBe("fallback");
  });
});

function validationError(): ApiError {
  return new ApiError({
    status: 422,
    message: "参数校验失败",
    error: "VALIDATION_ERROR",
    meta: {
      details: [
        {
          code: "PASSWORD_INVALID",
          loc: ["body", "password"],
          message: "具体密码规则",
        },
      ],
    },
  });
}
