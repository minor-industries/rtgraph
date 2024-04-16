package assets

import "embed"

//go:embed rtgraph/*.js rtgraph/*.css
var FS embed.FS
