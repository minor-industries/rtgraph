package rtgraph

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/assets"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/subscription"
	"net/http"
	"nhooyr.io/websocket"
	"time"
)

// SetupServer sets up all the routes
func (g *Graph) SetupServer(rg *gin.RouterGroup) {
	rg.GET("/*filepath", func(c *gin.Context) {
		filepath := c.Param("filepath")
		switch filepath {
		case "/ws":
			g.handleWebSocket(c)
		case "/":
			c.Status(http.StatusNotFound)
		default:
			c.FileFromFS("rtgraph"+filepath, http.FS(assets.FS))
		}
	})
}

// Separate function to handle WebSocket connections
func (g *Graph) handleWebSocket(c *gin.Context) {
	ctx := c.Request.Context()

	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	defer func() {
		_ = conn.Close(websocket.StatusInternalError, "Closed unexpectedly")
	}()

	_, reqBytes, err := conn.Read(ctx)
	if err != nil {
		fmt.Println("ws read error", err.Error())
		return
	}
	conn.CloseRead(ctx)

	var req subscription.Request
	err = json.Unmarshal(reqBytes, &req)
	if err != nil {
		fmt.Println("ws error", err.Error())
		return
	}

	msgCh := make(chan *messages.Data)
	now := time.Now()

	go func() {
		g.Subscribe(&req, now, msgCh)
		close(msgCh)
	}()

	for data := range msgCh {
		binmsg, err := data.MarshalMsg(nil)
		if err != nil {
			fmt.Println("marshal msg error", err)
			return
		}

		if err := conn.Write(ctx, websocket.MessageBinary, binmsg); err != nil {
			fmt.Println("write binary to websocket error", err)
			return
		}
	}
}
