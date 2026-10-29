# Native Chrome panel width

EZEapply uses Chrome's native side panel. Chrome owns the divider and minimum width; extension HTML, CSS and zoom cannot move that native minimum. The [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) exposes panel path, enablement, layout and open/close operations, but no width setter.

The interface reflows at the available width and includes its own zoom controls. The collapse arrows close the full native panel; the optional floating button restores it. EZEapply does not add an iframe overlay over employer pages.
