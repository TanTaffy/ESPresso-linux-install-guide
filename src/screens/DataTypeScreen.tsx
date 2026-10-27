import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { uid, type DataType } from '../model';
import type { EditorController } from '../editor/useEditor';
import { FieldLabel } from '../components/FieldLabel';
import { FieldTable } from '../components/FieldTable';

export function DataTypeScreen({
  project,
  change,
}: Pick<EditorController, 'project' | 'change'>) {
  const [selected, setSelected] = useState('');
  if (!project) return null;
  const types = project.types ?? [],
    type = types.find((t) => t.id === selected) ?? types[0];
  const imported = !!project.imported?.types.some((t) => t.id === type?.id);
  function edit(update: (t: DataType) => void) {
    if (type) change((p) => update(p.types!.find((t) => t.id === type.id)!));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Data types</h1>
          <p>
            Reusable payload definitions for snapshots, queues and mailboxes.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            const id = uid();
            change((p) => {
              (p.types ??= []).push({
                id,
                name: `Payload${types.length + 1}`,
                kind: 'struct',
                fields: [],
                values: [],
                cppType: '',
                headers: [],
                libraryIds: [],
              });
            });
            setSelected(id);
          }}
        >
          <Plus size={15} />
          Add data type
        </button>
      </div>
      <div className="config-layout">
        <section className="config-settings">
          {types.map((t) => (
            <button
              key={t.id}
              className={`tree-item ${type?.id === t.id ? 'active' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              {t.name}
              <small>{t.kind}</small>
            </button>
          ))}
          {!types.length && (
            <p className="muted">
              Add a struct, enum, or type supplied by a library.
            </p>
          )}
        </section>
        <section className="type-editor">
          {type && (
            <>
              {imported && (
                <p className="imported-notice">
                  <span className="imported-badge">Imported · Read-only</span>{' '}
                  This definition is used by preserved source. Add a new type
                  for a different payload.
                </p>
              )}
              <fieldset className="plain-fieldset" disabled={imported}>
                <div className="form-pair">
                  <FieldLabel label="Type name">
                    <input
                      aria-label="Data type name"
                      value={type.name}
                      onChange={(e) =>
                        edit((t) => {
                          t.name = e.target.value;
                        })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="Definition">
                    <select
                      aria-label="Data type kind"
                      value={type.kind}
                      onChange={(e) =>
                        edit((t) => {
                          t.kind = e.target.value as DataType['kind'];
                        })
                      }
                    >
                      <option value="struct">Struct</option>
                      <option value="enum">Enum</option>
                      <option value="external">External / library type</option>
                    </select>
                  </FieldLabel>
                </div>
                {type.kind === 'struct' && (
                  <FieldTable
                    fields={type.fields}
                    types={types.filter((t) => t.id !== type.id)}
                    onChange={(fields) =>
                      edit((t) => {
                        t.fields = fields;
                      })
                    }
                  />
                )}
                {type.kind === 'enum' && (
                  <>
                    <table className="fields-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Integer value</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {type.values.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <input
                                aria-label={`Enum member ${v.id}`}
                                value={v.name}
                                onChange={(e) =>
                                  edit((t) => {
                                    t.values.find((x) => x.id === v.id)!.name =
                                      e.target.value;
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Enum value ${v.id}`}
                                value={v.value}
                                onChange={(e) =>
                                  edit((t) => {
                                    t.values.find((x) => x.id === v.id)!.value =
                                      e.target.value;
                                  })
                                }
                              />
                            </td>
                            <td>
                              <button
                                className="icon-button danger"
                                aria-label={`Remove member ${v.name}`}
                                onClick={() =>
                                  edit((t) => {
                                    t.values = t.values.filter(
                                      (x) => x.id !== v.id,
                                    );
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
                        edit((t) => {
                          t.values.push({
                            id: uid(),
                            name: `Value${t.values.length}`,
                            value: String(t.values.length),
                          });
                        })
                      }
                    >
                      <Plus size={14} />
                      Add member
                    </button>
                  </>
                )}
                {type.kind === 'external' && (
                  <>
                    <FieldLabel
                      label="Qualified C++ type"
                      hint="For example BNO055::Data"
                    >
                      <input
                        aria-label="External C++ type"
                        className="mono"
                        value={type.cppType}
                        onChange={(e) =>
                          edit((t) => {
                            t.cppType = e.target.value;
                          })
                        }
                      />
                    </FieldLabel>
                    <FieldLabel
                      label="Include headers"
                      hint="One per line, for example BNO055.hpp"
                    >
                      <textarea
                        aria-label="External type headers"
                        className="mono"
                        value={type.headers.join('\n')}
                        onChange={(e) =>
                          edit((t) => {
                            t.headers = e.target.value.split('\n');
                          })
                        }
                      />
                    </FieldLabel>
                    <h3>Libraries</h3>
                    {(project.libraries ?? []).map((l) => (
                      <label className="check-row" key={l.id}>
                        <input
                          type="checkbox"
                          checked={type.libraryIds.includes(l.id)}
                          onChange={(e) =>
                            edit((t) => {
                              t.libraryIds = e.target.checked
                                ? [...t.libraryIds, l.id]
                                : t.libraryIds.filter((id) => id !== l.id);
                            })
                          }
                        />
                        {l.name}
                      </label>
                    ))}
                    <p className="info-note">
                      External types must be trivially copyable. Use value data
                      without owning pointers, strings or dynamic containers.
                      The generated C++ checks this when you build.
                    </p>
                  </>
                )}
                <button
                  className="button spaced"
                  onClick={() =>
                    change((p) => {
                      p.types = p.types!.filter((t) => t.id !== type.id);
                    })
                  }
                >
                  <Trash2 size={14} />
                  Remove data type
                </button>
              </fieldset>
            </>
          )}
        </section>
      </div>
    </>
  );
}
