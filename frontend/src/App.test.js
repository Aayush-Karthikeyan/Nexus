import { render, screen } from '@testing-library/react';
import App from './App';

// Smoke test: the app mounts at "/" and the landing page renders the wordmark.
// Catches provider/router wiring breakages and import-time crashes.
test('renders the Nexus landing page', () => {
  render(<App />);
  expect(screen.getAllByText(/NEXUS/i).length).toBeGreaterThan(0);
});
