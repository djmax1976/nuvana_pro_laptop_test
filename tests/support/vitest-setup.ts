import "@testing-library/jest-dom";

// JSDOM polyfills for Radix UI components
// Radix Select and other components use browser APIs not available in JSDOM

// Polyfill for Element.scrollIntoView
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {
    // No-op implementation for tests
  };
}

// Polyfill for pointer capture (used by Radix Select)
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {
    // No-op
  };
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {
    // No-op
  };
}
