import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { fieldTypes, uid, type Field, type DataType } from '../model';

export function FieldTable({
  fields,
  types = [],
  onChange,
}: {
  fields: Field[];
  types?: DataType[];
  onChange: (fields: Field[]) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(() =>
    fields.some(
      (f) =>
        f.arrayLength ||
        !['0', '0.0f', 'false', '{}', ''].includes(f.initialValue),
    ),
  );
  function edit(id: string, update: (field: Field) => void) {
    const next = structuredClone(fields);
    update(next.find((f) => f.id === id)!);
    onChange(next);
  }
  return (
    <>
      <table className="fields-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            {showAdvanced && (
              <>
                <th>Array length</th>
                <th>Initial value</th>
              </>
            )}
            <th />
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id}>
              <td>
                <input
                  aria-label={`Field name ${f.id}`}
                  value={f.name}
                  onChange={(e) =>
                    edit(f.id, (x) => {
                      x.name = e.target.value;
                    })
                  }
                />
              </td>
              <td>
                <div className="field-type-control">
                  <select
                    aria-label={`Field type ${f.id}`}
                    value={f.type}
                    onChange={(e) =>
                      edit(f.id, (x) => {
                        x.type = e.target.value;
                        x.initialValue =
                          x.arrayLength || x.type.startsWith('type:')
                            ? '{}'
                            : x.type === 'bool'
                              ? 'false'
                              : '0';
                      })
                    }
                  >
                    {fieldTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                    {types.map((t) => (
                      <option key={t.id} value={`type:${t.id}`}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {!showAdvanced && !!f.arrayLength && (
                    <span
                      className="array-length-badge"
                      aria-label={`${f.name} array length ${f.arrayLength}`}
                    >
                      [{f.arrayLength}]
                    </span>
                  )}
                </div>
              </td>
              {showAdvanced && (
                <>
                  <td>
                    <input
                      aria-label={`Array length ${f.id}`}
                      type="number"
                      min={1}
                      max={4096}
                      placeholder="Scalar"
                      value={f.arrayLength ?? ''}
                      onChange={(e) =>
                        edit(f.id, (x) => {
                          if (e.target.value) {
                            x.arrayLength = Number(e.target.value);
                            x.initialValue = '{}';
                          } else {
                            delete x.arrayLength;
                            x.initialValue = x.type.startsWith('type:')
                              ? '{}'
                              : x.type === 'bool'
                                ? 'false'
                                : '0';
                          }
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Initial value ${f.id}`}
                      value={f.initialValue}
                      disabled={!!f.arrayLength}
                      onChange={(e) =>
                        edit(f.id, (x) => {
                          x.initialValue = e.target.value;
                        })
                      }
                    />
                  </td>
                </>
              )}
              <td>
                <button
                  className="icon-button danger"
                  aria-label={`Remove field ${f.name}`}
                  onClick={() => onChange(fields.filter((x) => x.id !== f.id))}
                >
                  <X size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="field-actions">
        <button
          type="button"
          className="button"
          onClick={() =>
            onChange([
              ...fields,
              {
                id: uid(),
                name: `field_${fields.length + 1}`,
                type: 'uint16_t',
                initialValue: '0',
              },
            ])
          }
        >
          <Plus size={15} />
          Add field
        </button>
        <label className="array-mode-toggle">
          <input
            type="checkbox"
            role="switch"
            aria-label="Array mode"
            checked={showAdvanced}
            onChange={(e) => setShowAdvanced(e.target.checked)}
          />
          <span>Array mode</span>
        </label>
      </div>
      <p className="info-note">
        Arrays have a fixed length and start with zero values. Nested structs
        and library types use {'{}'} defaults; enum fields can use a member
        name.
      </p>
    </>
  );
}
