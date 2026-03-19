export type TitlePolicyToken = "pageTitle" | "siteName" | "siteSubtitle";

export type TitlePolicyPart =
  | {
      kind: "token";
      value: TitlePolicyToken;
    }
  | {
      kind: "literal";
      value: string;
    };

export type TitlePolicy = {
  parts: TitlePolicyPart[];
  homeMode?: "siteOnly" | "policy";
  dedupe?: boolean;
};
