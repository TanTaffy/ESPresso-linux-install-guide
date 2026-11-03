import type { LayoutNode, Project, SharedStruct, Step } from '../model';

// User-facing names are free text. Generated identifiers stay valid and unique.
export function codeSymbol(name: string) {
  let symbol = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!symbol || !/^[a-z]/.test(symbol)) symbol = `data_${symbol || 'value'}`;
  // Prefix keywords, library/runtime namespaces and implementation-reserved names.
  if (
    new Set([
      'and_eq',
      'atomic_cancel',
      'atomic_commit',
      'atomic_noexcept',
      'bitand',
      'bitor',
      'char8_t',
      'char16_t',
      'char32_t',
      'compl',
      'concept',
      'consteval',
      'constinit',
      'const_cast',
      'co_await',
      'co_return',
      'co_yield',
      'decltype',
      'dynamic_cast',
      'not_eq',
      'or_eq',
      'reflexpr',
      'requires',
      'static_cast',
      'synchronized',
      'wchar_t',
      'xor_eq',
      'event',
      'parameters',
      'alignas',
      'alignof',
      'and',
      'asm',
      'auto',
      'bool',
      'break',
      'case',
      'catch',
      'char',
      'class',
      'const',
      'constexpr',
      'continue',
      'default',
      'delete',
      'do',
      'double',
      'else',
      'enum',
      'explicit',
      'export',
      'extern',
      'false',
      'float',
      'for',
      'friend',
      'goto',
      'if',
      'inline',
      'int',
      'long',
      'mutable',
      'namespace',
      'new',
      'noexcept',
      'not',
      'nullptr',
      'operator',
      'or',
      'private',
      'protected',
      'public',
      'register',
      'reinterpret_cast',
      'return',
      'short',
      'signed',
      'sizeof',
      'static',
      'static_assert',
      'struct',
      'switch',
      'template',
      'this',
      'thread_local',
      'throw',
      'true',
      'try',
      'typedef',
      'typeid',
      'typename',
      'union',
      'unsigned',
      'using',
      'virtual',
      'void',
      'volatile',
      'while',
      'xor',
      'shared',
      'runtime',
      'handles',
      'config',
      'std',
      'main',
    ]).has(symbol) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(symbol)
  )
    symbol = `data_${symbol}`;
  return symbol.slice(0, 48).replace(/_+$/, '');
}

export const sampleType = (symbol: string) =>
  symbol
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('') + 'Sample';

export function availableSymbol(
  project: Project,
  name: string,
  excludeId?: string,
) {
  const base = codeSymbol(name);
  let symbol = base,
    suffix = 2;
  while (
    project.nodes.some(
      (n) =>
        n.id !== excludeId &&
        (n.symbol.toLowerCase() === symbol ||
          (n.kind === 'struct' &&
            n.typeName.toLowerCase() === sampleType(symbol).toLowerCase())),
    ) ||
    project.types?.some(
      (t) => t.name.toLowerCase() === sampleType(symbol).toLowerCase(),
    )
  )
    symbol = `${base}_${suffix++}`;
  return symbol;
}

export function stepLabel(kind: Step['kind'], data?: SharedStruct) {
  const verb = {
    placeholder: 'New placeholder',
    notify: 'Notify task',
    send: 'Send',
    receive: 'Receive',
    read: 'Read',
    write: 'Publish',
  }[kind];
  return data ? `${verb} ${data.name}` : verb;
}

export function syncCodeNames(
  project: Project,
  before: LayoutNode,
  node: LayoutNode,
) {
  if (
    before.name === node.name ||
    node.codeNamesManual ||
    node.codeNamesLocked ||
    node.configNamespace ||
    project.imported?.nodes.some((n) => n.id === node.id)
  )
    return;
  const symbol = availableSymbol(project, node.name, node.id);
  node.symbol = symbol;
  if (node.kind === 'task') {
    const from = `Config::${before.symbol}::`,
      to = `Config::${symbol}::`;
    if (node.periodExpression)
      node.periodExpression = node.periodExpression.replaceAll(from, to);
    for (const parameter of node.parameters ?? [])
      parameter.value = parameter.value.replaceAll(from, to);
  }
  if (node.kind === 'struct' && before.kind === 'struct') {
    node.typeName = sampleType(symbol);
    for (const task of project.nodes)
      if (task.kind === 'task')
        for (const step of [...task.setup, ...task.loop])
          if (step.structId === node.id) {
            // Imported calls are preserved verbatim; their local names cannot change.
            if (project.imported?.nodes.some((n) => n.id === task.id)) continue;
            if (step.localName === before.symbol) step.localName = symbol;
            if (step.name === stepLabel(step.kind, before))
              step.name = stepLabel(step.kind, node);
          }
  }
}
