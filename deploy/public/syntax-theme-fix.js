// Script to ensure syntax highlighting is properly isolated from site theme
document.addEventListener('DOMContentLoaded', function() {
  // Function to apply fixes to syntax highlighter
  function applySyntaxHighlighterFixes() {
    // Find all syntax highlighter elements
    const highlighterElements = document.querySelectorAll('.syntax-highlighter-override');
    
    // Apply fixes to each element
    highlighterElements.forEach(element => {
      // Find all code, pre, and span elements inside
      const codeElements = element.querySelectorAll('code, pre, span');
      
      // Ensure background inheritance
      codeElements.forEach(el => {
        el.style.background = 'inherit';
        el.style.colorScheme = 'none';
      });
    });
    
    // Also apply to any code elements with language classes
    const languageCodeElements = document.querySelectorAll('code[class*="language-"], pre[class*="language-"]');
    languageCodeElements.forEach(el => {
      el.style.background = 'inherit';
      el.style.colorScheme = 'none';
    });
  }
  
  // Apply immediately
  applySyntaxHighlighterFixes();
  
  // Also apply when theme is toggled
  document.addEventListener('themeChange', applySyntaxHighlighterFixes);
  
  // Create a mutation observer to watch for dynamically added content
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        applySyntaxHighlighterFixes();
      }
    });
  });
  
  // Start observing the document
  observer.observe(document.body, { childList: true, subtree: true });
}); 