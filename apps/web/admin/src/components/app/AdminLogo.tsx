import { Link } from "@tanstack/react-router";

import styles from "./AdminLogo.module.css";

export function AdminLogo(props: { to?: string; ariaLabel: string }) {
  const to = props.to ?? "/";

  return (
    <Link to={to} aria-label={props.ariaLabel} className={styles.link}>
      <img src="/logo.svg" width={80} height={80} className={styles.img} alt="" />
    </Link>
  );
}
