import { Plus, X } from 'lucide-react';
import { fieldTypes, uid, type SharedStruct } from '../model';
import { FieldLabel } from './FieldLabel';
export function StructFields({
  shared,
  updateShared,
}: {
  shared?: SharedStruct;
  updateShared: (edit: (shared: SharedStruct) => void) => void;
}) {
  if (!shared) return null;
  return (
    <>
      <div className="form-pair">
        <FieldLabel label="Display name">
          <input
            aria-label="Struct display name"
            value={shared.name}
            onChange={(e) => updateShared((s) => (s.name = e.target.value))}
          />
        </FieldLabel>
        <FieldLabel label="Instance symbol">
          <input
            aria-label="Struct instance symbol"
            className="mono"
            value={shared.symbol}
            onChange={(e) => updateShared((s) => (s.symbol = e.target.value))}
          />
        </FieldLabel>
      </div>
      <FieldLabel label="C++ type name">
        <input
          aria-label="Struct type name"
          className="mono"
          value={shared.typeName}
          onChange={(e) => updateShared((s) => (s.typeName = e.target.value))}
        />
      </FieldLabel>
      <div className="section-title">
        <h3>Fields</h3>
        <span className="muted">Copied together under one mutex</span>
      </div>
      <table className="fields-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Initial value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shared.fields.map((f) => (
            <tr key={f.id}>
              <td>
                <input
                  aria-label={`Field name ${f.id}`}
                  value={f.name}
                  onChange={(e) =>
                    updateShared((s) => {
                      s.fields.find((x) => x.id === f.id)!.name =
                        e.target.value;
                    })
                  }
                />
              </td>
              <td>
                <select
                  aria-label={`Field type ${f.id}`}
                  value={f.type}
                  onChange={(e) =>
                    updateShared((s) => {
                      const x = s.fields.find((x) => x.id === f.id)!;
                      x.type = e.target.value;
                      x.initialValue =
                        x.type === 'bool'
                          ? 'false'
                          : x.type === 'float'
                            ? '0.0f'
                            : '0';
                    })
                  }
                >
                  {fieldTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  aria-label={`Initial value ${f.id}`}
                  value={f.initialValue}
                  onChange={(e) =>
                    updateShared((s) => {
                      s.fields.find((x) => x.id === f.id)!.initialValue =
                        e.target.value;
                    })
                  }
                />
              </td>
              <td>
                <button
                  className="icon-button danger"
                  aria-label={`Remove field ${f.name}`}
                  onClick={() =>
                    updateShared((s) => {
                      s.fields = s.fields.filter((x) => x.id !== f.id);
                    })
                  }
                >
                  <X size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="button"
        onClick={() =>
          updateShared((s) =>
            s.fields.push({
              id: uid(),
              name: `field_${s.fields.length + 1}`,
              type: 'uint16_t',
              initialValue: '0',
            }),
          )
        }
      >
        <Plus size={15} />
        Add field
      </button>
    </>
  );
}
