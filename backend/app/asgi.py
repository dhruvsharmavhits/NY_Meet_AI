import socketio

from app.main import app
from app.websocket.socket_manager import sio

application = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="socket.io")
