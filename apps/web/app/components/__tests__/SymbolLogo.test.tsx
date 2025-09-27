/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import SymbolLogo from '../SymbolLogo';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ onError, ...props }: { onError?: (event: Event) => void }) => (
    createElement('img', {
      ...props,
      onError: (event: Event) => {
        onError?.(event);
      },
    })
  ),
}));

describe('SymbolLogo', () => {
  it('falls back to the default placeholder when image loading fails', () => {
    const { getByAltText } = render(
      createElement(SymbolLogo, { symbol: 'FAKE123', width: 36, height: 36 }),
    );

    const img = getByAltText('FAKE123') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('/logos/FAKE123.png');

    fireEvent.error(img);
    expect(img.getAttribute('src')).toContain('/logos/FAKE123.svg');

    fireEvent.error(img);
    expect(img.getAttribute('src')).toContain('/logos/_default.svg');
  });
});
