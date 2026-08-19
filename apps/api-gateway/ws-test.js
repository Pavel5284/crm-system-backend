const { io } = require('socket.io-client');

const token = 'СЮДА_ВСТАВЬ_ACCESS_TOKEN';

const socket = io('http://localhost:3000/notifications', {
    auth: { token },
});

socket.on('connect', () => console.log('✅ WS подключен, id сокета:', socket.id));
socket.on('notification', (notification) => {
    console.log('🔔 Новое уведомление:', notification);
});
socket.on('error', (msg) => console.error('❌ WS ошибка:', msg));
socket.on('disconnect', (reason) => console.log('🔌 Отключено:', reason));