import { Server } from "socket.io"


let connections = {}
let messages = {}
let usernames = {}   // socketId → display name

const MAX_MESSAGE_LENGTH = 2000;

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });


    io.on("connection", (socket) => {

        socket.on("join-call", (path, username) => {

            if (connections[path] === undefined) {
                connections[path] = []
            }

            // A reconnect or double-fire would otherwise list the same
            // socket twice, so every peer would be signalled twice
            if (!connections[path].includes(socket.id)) {
                connections[path].push(socket.id)
            }

            // Store username keyed by socket id
            usernames[socket.id] = username || "Anonymous";

            // Send each existing client the new joiner's id + full client list + name map
            const nameMap = {};
            connections[path].forEach(id => { nameMap[id] = usernames[id] || "Anonymous"; });

            for (let a = 0; a < connections[path].length; a++) {
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path], nameMap)
            }

            if (messages[path] !== undefined) {
                for (let a = 0; a < messages[path].length; ++a) {
                    io.to(socket.id).emit("chat-message", messages[path][a]['data'],
                        messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
                }
            }

        })

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        })

        socket.on("chat-message", (data, sender) => {

            // Drop anything that isn't a usable message before it reaches
            // the room history or the other participants
            if (typeof data !== "string") return;
            const text = data.trim();
            if (text === "" || text.length > MAX_MESSAGE_LENGTH) return;

            const displayName = (typeof sender === "string" && sender.trim() !== "")
                ? sender.trim().slice(0, 60)
                : "Anonymous";

            const [matchingRoom, found] = Object.entries(connections)
                .reduce(([room, isFound], [roomKey, roomValue]) => {


                    if (!isFound && roomValue.includes(socket.id)) {
                        return [roomKey, true];
                    }

                    return [room, isFound];

                }, ['', false]);

            if (found === true) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = []
                }

                messages[matchingRoom].push({ 'sender': displayName, "data": text, "socket-id-sender": socket.id })

                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", text, displayName, socket.id)
                })
            }

        })

        socket.on("disconnect", () => {

            delete usernames[socket.id];

            var key

            for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {

                for (let a = 0; a < v.length; ++a) {
                    if (v[a] === socket.id) {
                        key = k

                        for (let a = 0; a < connections[key].length; ++a) {
                            io.to(connections[key][a]).emit('user-left', socket.id)
                        }

                        var index = connections[key].indexOf(socket.id)

                        connections[key].splice(index, 1)


                        if (connections[key].length === 0) {
                            delete connections[key]
                            // Chat history lived only for this room — drop it
                            // too, otherwise it grows for the process lifetime
                            delete messages[key]
                        }
                    }
                }

            }


        })


    })


    return io;
}
