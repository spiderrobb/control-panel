import { useEffect, useCallback } from 'react';

/**
 * useStickyHeadings — detects when a heading becomes "stuck" at the top of
 * the scroll container and toggles a `.stuck` CSS class on it.
 *
 * Only one heading is stuck at a time (the one whose section is currently
 * at the top of the viewport). Each new heading replaces the previous.
 *
 * @param {React.RefObject} scrollContainerRef - ref to the `.content` scroll container
 * @param {*} contentKey - dependency that changes when MDX content re-renders
 */
export default function useStickyHeadings(scrollContainerRef, contentKey) {
  const updateStuck = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const sections = container.querySelectorAll('.heading-section');
    if (sections.length === 0) return;

    const containerTop = container.getBoundingClientRect().top;

    // Find the last section whose top has scrolled above the container top
    let activeHeading = null;

    sections.forEach((section) => {
      const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
      if (!heading) return;

      const sectionRect = section.getBoundingClientRect();
      const sectionAboveTop = sectionRect.top < containerTop + 2;
      const sectionStillVisible = sectionRect.bottom > containerTop + heading.offsetHeight;

      if (sectionAboveTop && sectionStillVisible) {
        activeHeading = heading;
      }
    });

    // Toggle .stuck — only on the single active heading
    sections.forEach((section) => {
      const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        heading.classList.toggle('stuck', heading === activeHeading);
      }
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const timerId = setTimeout(updateStuck, 50);
    container.addEventListener('scroll', updateStuck, { passive: true });

    return () => {
      clearTimeout(timerId);
      container.removeEventListener('scroll', updateStuck);
    };
  }, [scrollContainerRef, contentKey, updateStuck]);
}
