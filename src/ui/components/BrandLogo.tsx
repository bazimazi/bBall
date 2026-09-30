import styles from '../Screens.module.css';

/** The same mark used by the launcher, with readable text for assistive tech. */
export function BrandLogo() {
  return (
    <h1 className={styles.logo}>
      <img src={`${import.meta.env.BASE_URL}brand/mark.svg`} width="48" height="48" alt="" />
      <span className={styles.wordmark}>
        <span>b</span>Ball
      </span>
    </h1>
  );
}
