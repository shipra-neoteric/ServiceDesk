import { describe, expect, it } from 'vitest';
import { assertTransition, selectTemplateKey } from '../src/lib/workflowEngine.js';
import { HttpError } from '../src/lib/httpError.js';

describe('workflowEngine.assertTransition', () => {
  it('allows a valid transition', () => {
    expect(assertTransition('assign', 'RAISED')).toBe('ASSIGNED');
  });

  it('rejects Raised -> Closed directly (§6 no impossible transitions)', () => {
    expect(() => assertTransition('close', 'RAISED')).toThrow(HttpError);
  });

  it('rejects hold/cancel on a terminal status', () => {
    expect(() => assertTransition('hold', 'CLOSED')).toThrow(HttpError);
    expect(() => assertTransition('cancel', 'CANCELLED')).toThrow(HttpError);
  });

  it('resume returns PRESERVE_PRE_HOLD sentinel', () => {
    expect(assertTransition('resume', 'ON_HOLD')).toBe('PRESERVE_PRE_HOLD');
  });

  it('reopen only allowed from closed states', () => {
    expect(assertTransition('reopen', 'CLOSED')).toBe('REOPENED');
    expect(() => assertTransition('reopen', 'IN_PROGRESS')).toThrow(HttpError);
  });
});

describe('workflowEngine.selectTemplateKey', () => {
  it('emergency always wins', () => {
    expect(selectTemplateKey({ jobTypeCode: 'NEW_WORK', isEmergency: true, vendorRelated: false })).toBe('EMERGENCY');
  });
  it('new work maps to NEW_WORK template', () => {
    expect(selectTemplateKey({ jobTypeCode: 'NEW_WORK', isEmergency: false, vendorRelated: false })).toBe('NEW_WORK');
  });
  it('material-required job type maps to MATERIAL_REQUIRED template', () => {
    expect(selectTemplateKey({ jobTypeCode: 'MATERIAL_REQUIRED', isEmergency: false, vendorRelated: false })).toBe('MATERIAL_REQUIRED');
  });
  it('defaults to SIMPLE_REPAIR', () => {
    expect(selectTemplateKey({ jobTypeCode: 'PREVENTIVE', isEmergency: false, vendorRelated: false })).toBe('SIMPLE_REPAIR');
  });
});
