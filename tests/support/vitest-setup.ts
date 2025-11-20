import "@testing-library/jest-dom";

// JSDOM polyfills for Radix UI components
// Radix Select and other components use browser APIs not available in JSDOM
// Force override even if methods exist but are broken in JSDOM

// Polyfill for Element.scrollIntoView
Element.prototype.scrollIntoView = function () {
  // No-op implementation for tests
};

// Polyfill for pointer capture (used by Radix Select)
Element.prototype.hasPointerCapture = function () {
  return false;
};

Element.prototype.setPointerCapture = function () {
  // No-op
};

Element.prototype.releasePointerCapture = function () {
  // No-op
};
