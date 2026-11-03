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
      <FieldLabel label="Data name">
        <input
          aria-label="Struct display name"
          disabled={imported}
          value={shared.name}
          onChange={(e) =>
            updateShared((s) => {
              s.name = e.target.value;
            })
          }
        />
      </FieldLabel>
      {shared.payloadTypeId ? (
        <p className="info-note">
          Using{' '}
          {types.find((t) => t.id === shared.payloadTypeId)?.name ??
            'a reusable type'}
          . Change the payload definition under Advanced.
        </p>
      ) : (
        <>
          <div className="section-title">
            <h3>Fields in each sample</h3>
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
      <details className="advanced-settings">
        <summary>Advanced data settings</summary>
        <p className="info-note">
          Code names follow the data name and stay stable after export.
        </p>
        <FieldLabel label="Instance symbol">
          <input
            aria-label="Struct instance symbol"
            disabled={imported || shared.codeNamesLocked}
            className="mono"
            value={shared.symbol}
            onChange={(e) =>
              updateShared((s) => {
                s.symbol = e.target.value;
                s.codeNamesManual = true;
              })
            }
          />
        </FieldLabel>
        <FieldLabel label="C++ type name">
          <input
            aria-label="Struct type name"
            disabled={imported || shared.codeNamesLocked}
            className="mono"
            value={shared.typeName}
            onChange={(e) =>
              updateShared((s) => {
                s.typeName = e.target.value;
                s.codeNamesManual = true;
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
      </details>
    </>
  );
}
