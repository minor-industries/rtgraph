package rtgraph

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/assets"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/subscription"
	"github.com/pkg/errors"
	"io/fs"
	"net/http"
	"nhooyr.io/websocket"
	"time"
)

func (g *Graph) SetupServer(rg *gin.RouterGroup) {
	g.staticFiles(rg, assets.FS,
		"dygraph.min.js", "application/javascript",
		"dygraph.min.js.map", "application/javascript",
		"dygraph.css", "text/css",

		"msgpack.min.js", "application/javascript",

		"dist/rtgraph.js", "application/javascript",
		"dist/rtgraph.min.js", "application/javascript",
		"dist/combine.js", "application/javascript",
		"rtgraph.css", "text/css",

		"purecss/base-min.css", "text/css",
		"purecss/grids-min.css", "text/css",
		"purecss/grids-responsive-min.css", "text/css",
		"purecss/pure-min.css", "text/css",

		"purecss/base.css", "text/css",
		"purecss/grids.css", "text/css",
		"purecss/grids-responsive.css", "text/css",
	)

	rg.GET("/ws", func(c *gin.Context) {
		ctx := c.Request.Context()

		conn, wsErr := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if wsErr != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, wsErr)
			return
		}

		defer func() {
			_ = conn.Close(websocket.StatusInternalError, "Closed unexpectedly")
		}()

		_, reqBytes, err := conn.Read(ctx)
		if wsErr != nil {
			fmt.Println("ws read error", err.Error())
			return
		}
		conn.CloseRead(ctx)

		var req subscription.Request
		err = json.Unmarshal(reqBytes, &req)
		if wsErr != nil {
			fmt.Println("ws error", errors.Wrap(err, "unmarshal json"))
			return
		}

		msgCh := make(chan *messages.Data)

		now := time.Now()

		go g.Subscribe(&req, now, msgCh)

		for data := range msgCh {
			binmsg, err := data.MarshalMsg(nil)
			if err != nil {
				panic(errors.Wrap(err, "marshal msg")) // TODO
			}

			if err := conn.Write(ctx, websocket.MessageBinary, binmsg); err != nil {
				fmt.Println(errors.Wrap(err, "write binary to websocket"))
				return
			}
		}
	})
}

func (g *Graph) staticFiles(rg *gin.RouterGroup, fsys fs.FS, files ...string) {
	for i := 0; i < len(files); i += 2 {
		name := files[i]
		ct := files[i+1]
		rg.GET(name, func(c *gin.Context) {
			header := c.Writer.Header()
			header["Content-Type"] = []string{ct}
			content, err := fs.ReadFile(fsys, "rtgraph/"+name)
			if err != nil {
				c.Status(404)
				return
			}
			_, _ = c.Writer.Write(content)
		})
	}
}
