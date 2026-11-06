import type { DeveloperTools } from './model';

export function buildCommands(
  target: string,
  folder: string | null,
  tools: DeveloperTools | null,
) {
  const windows = tools?.platform === 'win32';
  const quote = (value: string) =>
    `'${windows ? value.replaceAll("'", "''") : value.replaceAll("'", "'\\''")}'`;
  return [
    ...(tools?.idfPath
      ? [
          `. ${quote(`${tools.idfPath}${windows ? '\\export.ps1' : '/export.sh'}`)}`,
        ]
      : []),
    ...(folder
      ? [`${windows ? 'Set-Location -LiteralPath' : 'cd --'} ${quote(folder)}`]
      : []),
    `idf.py set-target ${target}`,
    'idf.py build',
  ].join('\n');
}
