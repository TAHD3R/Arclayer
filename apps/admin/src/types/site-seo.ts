export type TitlePolicyPart =
  | { kind: "token"; value: "pageTitle" | "siteName" | "siteSubtitle" }
  | { kind: "literal"; value: string };

export type TitlePolicy = {
  parts: TitlePolicyPart[];
  homeMode?: "siteOnly" | "policy";
  dedupe?: boolean;
};
