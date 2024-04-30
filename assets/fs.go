package assets

import "embed"

//go:embed rtgraph/*.js rtgraph/*.css rtgraph/purecss/*.css
var FS embed.FS
