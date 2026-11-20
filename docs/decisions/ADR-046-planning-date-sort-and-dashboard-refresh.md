# ADR-046 — Planning date sorting and Dashboard refresh

Status: Implemented and checked locally

Date: 7 November 2026 (Asia/Kolkata)

- Events default to current and upcoming ceremonies by ascending start time, followed by ended ceremonies with the most recent start first. Earliest and Latest are explicit alternatives. Express sorts before pagination and uses the same order to locate a newly created event. A ceremony that spans midnight remains current until its end.
- Tasks default to overdue open tasks, then open tasks with upcoming deadlines, then undated open tasks, then completed tasks. Dated open tasks within each group sort by ascending deadline. Newest added preserves the earlier order as an explicit alternative. Sorting is applied before pagination and does not change counts, filters, or access.
- Keep all existing ceremony values. Add Pre-wedding Photoshoot, Welcome Dinner, Cocktail Night, Diya Mangula Puja, Jai Ragada and Asthamangala to the chooser and API.
- Keep the existing Dashboard summary endpoint. A successful Tasks page save, removal or repeat edit notifies other tabs of a change for that wedding. A Dashboard restored from the browser back/forward cache also revalidates. Normal background refresh limits and account/wedding authorization still apply. This addresses a reproduced stale count path, while the original reported zero has no captured request.
- Match the refined Stitch Dashboard by stretching Upcoming Ceremonies alongside Family Tasks and Recent Activity on desktop. Keep the mobile stack. Add 12 px above Reject invitation and use the existing form styling for the owner-approved Sort by controls.
