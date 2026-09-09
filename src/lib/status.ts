import type { FlowValue, DerivedValue } from '../types/generated';

export function statusLabel(status: FlowValue['status'] | DerivedValue['status']): string {
  switch (status) {
    case 'observed':
      return 'observed';
    case 'confirmed_zero':
      return 'confirmed zero';
    case 'absent':
      return 'absent';
    case 'not_applicable':
      return 'not applicable';
    default:
      return status;
  }
}

/** True only for values safe to use in charts, sums, and formatted display. */
export function isUsable(v: FlowValue | DerivedValue): v is (FlowValue | DerivedValue) & { value: number } {
  return v.status === 'observed' || v.status === 'confirmed_zero';
}
