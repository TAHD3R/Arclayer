import type { ReactNode } from "react";

import {
  optionalActionSlot,
  optionalImageSlot,
  optionalListSlot,
  optionalStringSlot,
  requiredActionSlot,
  requiredImageSlot,
  requiredListSlot,
  requiredStringSlot,
  type RenderAction,
  type RenderListItem,
  type SiteInteraction,
  type SiteRenderSection,
} from "./contracts";

export type VisitorComponentProps = Readonly<{
  section: SiteRenderSection;
  interactionMode?: "active" | "read-only";
  onInteraction?: (interaction: SiteInteraction) => void;
}>;

export type VisitorComponent = (props: VisitorComponentProps) => ReactNode;

type KeyedListItem = Readonly<{ item: RenderListItem; key: string }>;

function withStableListItemKeys(items: readonly RenderListItem[]): readonly KeyedListItem[] {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const fingerprint = JSON.stringify([
      item.label ?? null,
      item.title ?? null,
      item.body ?? null,
      item.href ?? null,
      item.image ?? null,
    ]);
    const occurrence = occurrences.get(fingerprint) ?? 0;
    occurrences.set(fingerprint, occurrence + 1);
    return { item, key: `${fingerprint}:${occurrence}` };
  });
}

export function SiteHeader({ section, interactionMode, onInteraction }: VisitorComponentProps) {
  const brand = requiredImageSlot(section, "brand");
  const navigation = withStableListItemKeys(optionalListSlot(section, "navigation.items"));
  const action = optionalActionSlot(section, "action.primary");
  return (
    <header className="arc-site-header" data-variant={section.variantKey}>
      <div className="arc-site-shell arc-site-header__inner">
        <img className="arc-site-brand" src={brand.src} alt={brand.alt ?? ""} />
        <nav aria-label="Primary navigation">
          <ul className="arc-site-nav">
            {navigation.map(({ item, key }) => (
              <li key={key}>
                {item.href ? (
                  <a href={item.href}>{item.label ?? item.title}</a>
                ) : (
                  <span>{item.label ?? item.title}</span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {action ? (
          <Action
            section={section}
            action={action}
            interactionMode={interactionMode}
            onInteraction={onInteraction}
          />
        ) : null}
      </div>
    </header>
  );
}

export function LandingHero({ section, interactionMode, onInteraction }: VisitorComponentProps) {
  const eyebrow = optionalStringSlot(section, "eyebrow");
  const heading = requiredStringSlot(section, "heading");
  const body = optionalStringSlot(section, "body");
  const media = optionalImageSlot(section, "media.primary");
  const action = optionalActionSlot(section, "action.primary");
  return (
    <section className="arc-site-section arc-site-hero" data-variant={section.variantKey}>
      <div className="arc-site-shell arc-site-hero__grid">
        <div className="arc-site-hero__copy">
          {eyebrow ? <p className="arc-site-eyebrow">{eyebrow}</p> : null}
          <h1>{heading}</h1>
          {body ? <p className="arc-site-lede">{body}</p> : null}
          {action ? (
            <Action
              section={section}
              action={action}
              interactionMode={interactionMode}
              onInteraction={onInteraction}
            />
          ) : null}
        </div>
        {media ? (
          <img className="arc-site-hero__media" src={media.src} alt={media.alt ?? ""} />
        ) : null}
      </div>
    </section>
  );
}

export function LandingFeatureGrid({ section }: VisitorComponentProps) {
  const heading = requiredStringSlot(section, "heading");
  const body = optionalStringSlot(section, "body");
  const items = withStableListItemKeys(requiredListSlot(section, "items"));
  return (
    <section className="arc-site-section arc-site-feature-grid" data-variant={section.variantKey}>
      <div className="arc-site-shell">
        <div className="arc-site-section-heading">
          <h2>{heading}</h2>
          {body ? <p>{body}</p> : null}
        </div>
        <div className="arc-site-feature-grid__items">
          {items.map(({ item, key }) => (
            <article className="arc-site-feature" key={key}>
              {item.image ? <img src={item.image} alt="" /> : null}
              <h3>{item.title ?? item.label}</h3>
              {item.body ? <p>{item.body}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingCta({ section, interactionMode, onInteraction }: VisitorComponentProps) {
  const heading = requiredStringSlot(section, "heading");
  const body = optionalStringSlot(section, "body");
  const action = requiredActionSlot(section, "action.primary");
  return (
    <section className="arc-site-section arc-site-cta" data-variant={section.variantKey}>
      <div className="arc-site-shell arc-site-cta__inner">
        <h2>{heading}</h2>
        {body ? <p>{body}</p> : null}
        <Action
          section={section}
          action={action}
          interactionMode={interactionMode}
          onInteraction={onInteraction}
        />
      </div>
    </section>
  );
}

export function SiteFooter({ section }: VisitorComponentProps) {
  const brand = requiredImageSlot(section, "brand");
  const legal = optionalStringSlot(section, "legal");
  const navigation = withStableListItemKeys(optionalListSlot(section, "navigation.items"));
  return (
    <footer className="arc-site-footer" data-variant={section.variantKey}>
      <div className="arc-site-shell arc-site-footer__inner">
        <div>
          <img className="arc-site-brand" src={brand.src} alt={brand.alt ?? ""} />
          {legal ? <p>{legal}</p> : null}
        </div>
        <nav aria-label="Footer navigation">
          <ul className="arc-site-nav">
            {navigation.map(({ item, key }) => (
              <li key={key}>
                {item.href ? (
                  <a href={item.href}>{item.label ?? item.title}</a>
                ) : (
                  <span>{item.label ?? item.title}</span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

function Action({
  section,
  action,
  interactionMode = "active",
  onInteraction,
}: Readonly<{
  section: SiteRenderSection;
  action: RenderAction;
  interactionMode?: "active" | "read-only";
  onInteraction?: (interaction: SiteInteraction) => void;
}>) {
  if (interactionMode === "read-only") {
    return (
      <button className="arc-site-action" type="button" disabled>
        {action.label}
      </button>
    );
  }
  if (action.action === "navigate" && action.target) {
    return (
      <a className="arc-site-action" href={action.target}>
        {action.label}
      </a>
    );
  }
  const activate = () => {
    if (!onInteraction) {
      throw new Error(`No interaction handler registered for ${action.action}`);
    }
    onInteraction({ action: action.action, target: action.target, section });
  };
  return (
    <button
      className="arc-site-action"
      type={action.action === "submit" ? "submit" : "button"}
      onClick={activate}
    >
      {action.label}
    </button>
  );
}
