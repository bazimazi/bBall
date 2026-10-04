import styles from '../Screens.module.css';
import { useScreenFocus } from '../hooks/useScreenFocus';

/** The same mark used by the launcher, with readable text for assistive tech. */
export function BrandLogo() {
  const heading = useScreenFocus();
  return (
    <h1 ref={heading} className={styles.logo} tabIndex={-1} data-screen-heading>
      <img src={`${import.meta.env.BASE_URL}brand/mark.svg`} width="48" height="48" alt="" />
      <span className={styles.wordmark}>
        <span>b</span>Ball
      </span>
    </h1>
  );
}
