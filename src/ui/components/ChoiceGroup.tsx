import styles from '../Screens.module.css';

export function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: readonly { value: T; name: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.choiceGroup}>
      <legend className={styles.sectionLabel}>{label}</legend>
      <div className={styles.choices}>
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? styles.choiceOn : styles.choice}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.name}</span>
            {option.hint && <small>{option.hint}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
