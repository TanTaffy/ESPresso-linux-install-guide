import type { Node } from '@xyflow/react';
import type { LayoutNode, Phase } from '../model';
export type View = 'canvas' | 'task' | 'struct' | 'export';
export type StepSelection = { phase: Phase; id: string };
export type FlowData = {
  node: LayoutNode;
  showSteps: boolean;
  edit: (id: string) => void;
  step: (taskId: string, phase: Phase, id: string) => void;
};
export type FlowNode = Node<FlowData>;
