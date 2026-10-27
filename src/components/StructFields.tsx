import type { SharedStruct, DataType } from '../model';
import { FieldLabel } from './FieldLabel';
import { FieldTable } from './FieldTable';
export function StructFields({
  shared,
  updateShared,
  types = [],
  imported = false,
}: {
  shared?: SharedStruct;
  types?: DataType[];
  imported?: boolean;
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
            onChange={(e) =>
              updateShared((s) => {
                s.name = e.target.value;
              })
            }
          />
        </FieldLabel>
        <FieldLabel label="Instance symbol">
          <input
            aria-label="Struct instance symbol"
            disabled={imported}
            className="mono"
            value={shared.symbol}
            onChange={(e) =>
              updateShared((s) => {
                s.symbol = e.target.value;
              })
            }
          />
        </FieldLabel>
      </div>
      <FieldLabel label="C++ type name">
        <input
          aria-label="Struct type name"
          disabled={imported}
          className="mono"
          value={shared.typeName}
          onChange={(e) =>
            updateShared((s) => {
              s.typeName = e.target.value;
            })
          }
        />
      </FieldLabel>
      <FieldLabel label="Payload definition">
        <select
          aria-label="Payload definition"
          disabled={imported}
          value={shared.payloadTypeId ?? ''}
          onChange={(e) =>
            updateShared((s) => {
              s.payloadTypeId = e.target.value;
            })
          }
        >
          <option value="">Define fields here</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.kind})
            </option>
          ))}
        </select>
      </FieldLabel>
      {shared.payloadTypeId ? (
        <p className="info-note">
          This payload uses the selected definition from Data types. Library
          types must be safe to copy by value.
        </p>
      ) : (
        <>
          <div className="section-title">
            <h3>Fields</h3>
          </div>
          <fieldset disabled={imported} className="plain-fieldset">
            <FieldTable
              fields={shared.fields}
              types={types}
              onChange={(fields) =>
                updateShared((s) => {
                  s.fields = fields;
                })
              }
            />
          </fieldset>
        </>
      )}
    </>
  );
}
