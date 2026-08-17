import { isPaidModel, modelLabel } from '../lib/models';

interface ModelSelectProps {
  models: string[];
  value: string;
  disabled?: boolean;
  onPick: (model: string) => void;
}

export default function ModelSelect({ models, value, disabled, onPick }: ModelSelectProps) {
  return (
    <select
      className="model-select"
      value={value}
      onChange={(e) => onPick(e.target.value)}
      disabled={disabled}
      title="Modelo activo"
    >
      {!models.includes(value) && value && (
        <option value={value}>{(isPaidModel(value) ? '⚠ ' : '') + modelLabel(value)}</option>
      )}
      {models.map((m) => (
        <option key={m} value={m}>
          {(isPaidModel(m) ? '⚠ ' : '') + modelLabel(m)}
        </option>
      ))}
    </select>
  );
}