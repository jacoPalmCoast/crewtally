import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Field } from '@/components/Field';
import { Money } from '@/components/Money';
import { StatusLabel, type Status } from '@/components/StatusLabel';

jest.mock('@expo/vector-icons', () => ({
  Feather: ({ name, ...props }: { name: string }) =>
    require('react').createElement(require('react-native').Text, props, name),
}));

describe('Money', () => {
  it('formats dollars and cents and exposes a complete spoken amount', () => {
    render(<Money cents={124500} />);

    expect(screen.getByText('$1,245.00')).toBeTruthy();
    expect(screen.getByLabelText('1,245 dollars')).toBeTruthy();
  });
});

it('gives fields a visible focus indicator and preserves caller focus handlers', () => {
  const onFocus = jest.fn(), onBlur = jest.fn();
  render(<Field label="Amount (cents)" value="" onChangeText={jest.fn()} onFocus={onFocus} onBlur={onBlur} />);
  const input = screen.getByLabelText('Amount (cents)');
  fireEvent(input, 'focus', {});
  expect(input).toHaveStyle({ borderWidth: 2 });
  expect(onFocus).toHaveBeenCalledTimes(1);
  fireEvent(input, 'blur', {});
  expect(input).toHaveStyle({ borderWidth: 1 });
  expect(onBlur).toHaveBeenCalledTimes(1);
});

describe('StatusLabel', () => {
  const statuses: Array<{ status: Status; label: string }> = [
    { status: 'owed', label: 'Owed' },
    { status: 'settled', label: 'Settled' },
    { status: 'advance', label: 'Advance' },
    { status: 'pending', label: 'Pending' },
    { status: 'needsReview', label: 'Needs review' },
    { status: 'unrecorded', label: 'Unrecorded' },
    { status: 'checkNotCleared', label: 'Check not cleared' },
  ];

  it.each(statuses)('renders icon and visible text for $label', ({ status, label }) => {
    render(<StatusLabel status={status} />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId(`status-icon-${status}`)).toBeTruthy();
  });
});