# GreenHouse

Ứng dụng web giám sát và điều khiển nhà kính.

## Công nghệ

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js HTTP server
- Database: PostgreSQL (kết nối qua `DATABASE_URL`)
- Chatbot: Gemini API qua backend
- File `server/data/db.json` chỉ còn là **nguồn import một lần** qua `npm run db:import:*`, không còn dùng làm database runtime.
- Realtime thiết bị: MQTT qua HiveMQ Cloud/private broker

## Phân chia Frontend và Backend

### Frontend

Frontend là phần giao diện web cho người dùng thao tác và theo dõi nhà kính.

Các chức năng chính:

- Hiển thị dashboard dữ liệu cảm biến theo thời gian thực.
- Hiển thị biểu đồ và lịch sử dữ liệu cảm biến.
- Bật/tắt thiết bị thủ công như máy bơm, quạt, đèn.
- Tạo, bật/tắt và xóa quy tắc tự động hóa.
- Hiển thị danh sách cảnh báo và trạng thái đã đọc/chưa đọc.
- Gửi lệnh điều khiển thiết bị qua backend; backend publish MQTT tới ESP32/ESP8266.
- Đọc dữ liệu cảm biến từ backend để cập nhật dashboard/lịch sử/cảnh báo.
- Hiển thị trạng thái kết nối backend.

Các thư mục/file liên quan:

- `src/pages/Dashboard.jsx`: màn hình tổng quan.
- `src/pages/Controls.jsx`: màn hình điều khiển thiết bị.
- `src/pages/Automation.jsx`: màn hình cấu hình tự động hóa.
- `src/pages/Alerts.jsx`: m`àn hình cảnh báo.
- `src/pages/History.jsx`: màn hình lịch sử cảm biến.
- `src/lib/mqttClient.js`: helper MQTT phía web nếu cần debug; luồng chính không dùng MQTT credential trong trình duyệt.
- `src/lib/useMqtt.js`: helper subscribe/publish khi cần debug.
- `src/services/*`: gọi API backend.

### Backend

Backend là phần API trung gian để lưu dữ liệu, quản lý đăng nhập, cảnh báo và giao tiếp với các dịch vụ phía server.

Các chức năng chính:

- Cung cấp API đăng nhập và kiểm tra người dùng (bcryptjs + JWT, dữ liệu user lưu PostgreSQL).
- Lưu dữ liệu cảm biến vào PostgreSQL.
- Subscribe MQTT topic cảm biến theo `MQTT_TOPIC_PREFIX`, ví dụ `greenhouse/your-project-id/sensors`.
- Lưu trạng thái thiết bị vào PostgreSQL.
- Lưu quy tắc tự động hóa vào PostgreSQL.
- Lưu và cập nhật cảnh báo trong PostgreSQL.
- Publish yêu cầu gửi SMS qua MQTT khi có cảnh báo nguy hiểm.
- Cung cấp API CRUD chung cho các entity:
  - `SensorData`
  - `DeviceState`
  - `AutomationRule`
  - `Alert`

Các thư mục/file liên quan:

- `server/index.js`: khởi động HTTP server, kiểm tra kết nối + schema PostgreSQL, khai báo route chính.
- `server/auth.js`: xử lý đăng nhập và token (bcryptjs + JWT).
- `server/entities.js`: API CRUD cho dữ liệu chính (đều đọc/ghi PostgreSQL).
- `server/database.js`: khởi tạo connection pool PostgreSQL.
- `server/repositories/*`: query layer cho từng bảng PostgreSQL.
- `server/migrations/*`: SQL migration tạo schema.
- `server/scripts/import*FromJson.js`: nạp dữ liệu một lần từ `server/data/db.json` vào PostgreSQL.
- `server/mqtt.js`: publish MQTT phía backend.
- `server/sensorMqtt.js`: nhận dữ liệu cảm biến MQTT và lưu PostgreSQL.
- `server/sensorIngestion.js`: xử lý chung khi có sensor mới, gồm lưu DB, tạo cảnh báo và chạy automation.
- `server/sim800l.js`: publish yêu cầu gửi SMS cho ESP32/SIM800L.
- `server/data/db.json`: nguồn import (legacy JSON), backend runtime không đọc/ghi file này.

### Phần cứng

Phần cứng do ESP32/ESP8266 xử lý. Web không cần viết firmware, nhưng cần thống nhất topic và payload MQTT để hai bên giao tiếp đúng.

Nếu dùng HiveMQ public broker, không dùng topic quá chung như `greenhouse/sensors` vì broker này có nhiều người dùng. Hãy đặt `MQTT_TOPIC_PREFIX` đủ riêng, ví dụ `greenhouse/nhom01-2026` hoặc `greenhouse/<ten-do-an>-<ma-ngau-nhien>`, rồi cấu hình ESP dùng đúng prefix đó.

Trách nhiệm phần cứng:

- Đọc cảm biến và publish dữ liệu lên topic `<MQTT_TOPIC_PREFIX>/sensors`, ví dụ `greenhouse/your-project-id/sensors`.
- Subscribe các topic điều khiển như `<MQTT_TOPIC_PREFIX>/control/pump`, `<MQTT_TOPIC_PREFIX>/control/fan`, `<MQTT_TOPIC_PREFIX>/control/light`.
- Bật/tắt relay hoặc thiết bị thật khi nhận lệnh.
- Publish trạng thái thật của thiết bị về topic `<MQTT_TOPIC_PREFIX>/device/status` sau khi relay đã đổi trạng thái.
- ESP32 gắn SIM800L subscribe topic `<MQTT_TOPIC_PREFIX>/alerts/sms` để gửi SMS.
- Chatbot Gemini đọc ngữ cảnh cảm biến, thiết bị, cảnh báo và luật tự động hóa từ PostgreSQL.
- Chatbot ưu tiên hồ sơ cây trong `plant_profiles`; nếu chưa có hồ sơ cây, chatbot dùng kiến thức nông nghiệp phổ thông để tư vấn chung.

## MQTT Payload Specification

Các topic mặc định được tạo từ `MQTT_TOPIC_PREFIX` trong `server/mqttTopics.js`. Nếu đặt biến riêng như `SENSOR_DATA_TOPIC`, `DEVICE_STATUS_TOPIC`, `GATEWAY_CONTROL_TOPIC` hoặc `DEVICE_CONTROL_TOPIC_PUMP`, backend sẽ dùng giá trị override đó.

Topic publish/subscribe chính:

```text
ESP publish      -> <MQTT_TOPIC_PREFIX>/sensors
Backend subscribe -> <MQTT_TOPIC_PREFIX>/sensors

Backend publish  -> <MQTT_TOPIC_PREFIX>/control/pump
Backend publish  -> <MQTT_TOPIC_PREFIX>/control/fan
Backend publish  -> <MQTT_TOPIC_PREFIX>/control/light
ESP subscribe    -> <MQTT_TOPIC_PREFIX>/control/<device>

Backend publish  -> <MQTT_TOPIC_PREFIX>/control/gateway
Gateway subscribe -> <MQTT_TOPIC_PREFIX>/control/gateway

ESP publish      -> <MQTT_TOPIC_PREFIX>/device/status
Backend subscribe -> <MQTT_TOPIC_PREFIX>/device/status

Backend publish  -> <MQTT_TOPIC_PREFIX>/alerts/sms
ESP/SIM800L subscribe -> <MQTT_TOPIC_PREFIX>/alerts/sms
```

Sensor payload format:

```json
{
  "temperature": 28.5,
  "humidity": 70,
  "soil_moisture": 42,
  "light": 650
}
```

Backend chấp nhận alias legacy cho một vài field cảm biến, ví dụ `temp`, `soilMoisture`, `soil` và `lux`, nhưng firmware mới nên dùng snake_case như ví dụ trên.

Device command payload format backend publish cho ESP:

```json
{
  "device": "pump",
  "is_on": true,
  "action": "turn_on",
  "source": "manual"
}
```

Field bắt buộc để ESP xử lý ổn định là `device` và `is_on`. `action` là `turn_on` hoặc `turn_off`; `source` là `manual` hoặc `automation`.

Gateway update frequency payload format backend publish:

```json
{
  "target": "gateway",
  "command": "set_update_frequency",
  "update_frequency_seconds": 10,
  "unit": "seconds",
  "source": "manual"
}
```

Gateway nhận thông số này, còn việc Gateway truyền tiếp cấu hình cho các node là phần firmware xử lý.

Device status payload format ESP phải publish lại:

```json
{
  "device": "pump",
  "is_on": true
}
```

Có thể thêm field khác, nhưng `device` và `is_on` là bắt buộc:

```json
{
  "device": "pump",
  "is_on": true,
  "mode": "manual",
  "online": true,
  "timestamp": "2026-05-18T10:30:00Z"
}
```

Payload status hợp lệ:

```json
{ "device": "pump", "is_on": true }
```

Payload status không hợp lệ và sẽ bị backend bỏ qua:

```json
{ "pump": true }
```

```json
{ "device": "pump" }
```

```json
{ "is_on": true }
```

```json
{ "device": "pump", "is_on": "true" }
```

Quy tắc validate status ở backend:

- Payload phải là JSON object.
- `device` phải tồn tại, không rỗng và map được với thiết bị trong bảng `devices` (`pump`, `fan`, `light` trong seed mặc định).
- `is_on` phải là boolean JSON thật: `true` hoặc `false`, không dùng `"true"`, `"false"`, `1`, `0`, `"ON"`.
- Backend không tự đoán trạng thái nếu thiếu `device` hoặc `is_on`.
- Khi payload hợp lệ, backend cập nhật `devices.is_on`, `last_seen_at`, các field tùy chọn hợp lệ như `mode`/`online`, rồi đánh dấu command log gần nhất là `device_confirmed=true` nếu khớp lệnh chờ xác nhận.

Luồng confirmation:

```text
Backend publish command
-> ESP nhận command
-> ESP bật/tắt relay thật
-> ESP publish status {"device":"pump","is_on":true}
-> Backend cập nhật trạng thái confirmed cho thiết bị
```

Luồng dữ liệu cảm biến:

```text
ESP32/ESP8266 -> MQTT <MQTT_TOPIC_PREFIX>/sensors -> Backend -> PostgreSQL -> Frontend gọi API để hiển thị
```

Test nhanh bằng MQTT Explorer hoặc HiveMQ WebSocket client:

1. Connect tới đúng broker, username/password và `MQTT_TOPIC_PREFIX` đang dùng trong `.env`.
2. Subscribe `<MQTT_TOPIC_PREFIX>/control/#` để xem command backend gửi ra khi bấm bật/tắt trên web.
3. Subscribe `<MQTT_TOPIC_PREFIX>/device/status` để xem status ESP publish lại.
4. Publish thủ công status hợp lệ lên `<MQTT_TOPIC_PREFIX>/device/status`:

```json
{ "device": "pump", "is_on": true, "mode": "manual", "timestamp": "2026-05-18T10:30:00Z" }
```

5. Publish thử payload sai như `{ "pump": true }`; backend phải log warning `[DeviceStatus] Ignored status payload...` và không cập nhật trạng thái.
6. Có thể dùng script có sẵn để publish sensor/status từ terminal:

```bash
npm run mqtt:pub -- greenhouse/your-project-id/device/status '{"device":"pump","is_on":true}' --json
```

## Cài đặt

```bash
npm install
```

## Cấu hình database

Backend yêu cầu PostgreSQL. Tạo file `.env` ở thư mục gốc:

```bash
DATABASE_URL=postgres://greenhouse:greenhouse123@localhost:5432/greenhouse
JWT_SECRET=greenhouse_dev_secret_change_me
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
```

`GEMINI_API_KEY` chỉ dùng ở backend. Không đặt key này trong biến `VITE_...` vì frontend sẽ bị lộ key ra trình duyệt.
Mặc định dùng `gemini-3.1-flash-lite` để phù hợp dự án cá nhân và free tier.

Tạo schema lần đầu (bắt buộc trước khi start server):

```bash
npm run db:migrate
```

Sau khi migrate, database mới đã có dữ liệu demo mặc định:

- Tài khoản `admin / admin123`.
- 3 thiết bị: `pump`, `fan`, `light`.
- Ngưỡng cảnh báo phổ biến, vài rule tự động, dữ liệu cảm biến/cảnh báo/log mẫu.
- Hồ sơ cây và cây đang trồng để chatbot có ngữ cảnh demo.

(Tuỳ chọn) Nếu vẫn muốn nạp dữ liệu legacy từ `server/data/db.json` vào PostgreSQL:

```bash
npm run db:import:devices
npm run db:import:sensors
npm run db:import:alerts
npm run db:import:automation
npm run db:import:users
```

Server khi start sẽ:

- Warm-up connection pool và in `[Database] Connection pool ready.`
- Kiểm tra các bảng bắt buộc (`devices`, `sensor_readings`, `alerts`, `automation_rules`, `users`) và in `[Database] Schema OK.`
- Nếu kết nối DB thất bại hoặc thiếu bảng, server sẽ exit và hướng dẫn chạy `npm run db:migrate`.

## Hồ sơ cây trồng cho chatbot

Chatbot dùng bảng `plant_profiles` để nhận diện cây theo tên hoặc alias trong câu hỏi, ví dụ `cà chua`, `ca chua`, `tomato`.
Chatbot cũng dùng bảng `user_plants` để biết các cây/khu vực đang trồng trong nhà kính.

Seed mặc định có một số cây phổ biến:

```text
Cà chua, xà lách, dâu tây, rau cải, dưa leo, ớt, rau muống, húng quế, bạc hà, cải thìa
```

Seed mặc định cho cây đang trồng:

```text
Khay 1: Cà chua
Khay 2: Xà lách
Chậu 1: Dâu tây
```

Luồng xử lý:

- Nếu câu hỏi khớp cây/khu vực trong `user_plants`, chatbot hiểu đó là cây đang được hỏi.
- Nếu cây có trong `plant_profiles`, chatbot dùng ngưỡng nhiệt độ, độ ẩm, độ ẩm đất và ánh sáng từ database.
- Nếu cây chưa có trong database, chatbot vẫn trả lời bằng kiến thức nông nghiệp phổ thông và nói rõ đó là khuyến nghị chung.
- Widget chatbot có dropdown chọn cây/khu vực. Frontend gọi `GET /chatbot/plants` và gửi `plantId` trong `POST /chatbot/message`.
- Khi chatbot đề xuất bật/tắt thiết bị, widget chỉ hiện nút xác nhận. Lệnh thật chỉ được gửi sau khi người dùng bấm xác nhận qua `POST /chatbot/device-action`.

Sau khi pull/cập nhật code có migration mới, chạy:

```bash
npm run db:migrate
```

## Chạy app

Mở terminal 1 để chạy backend:

```bash
npm run server
```

Mở terminal 2 để chạy frontend:

```bash
npm run dev
```

Frontend mặc định gọi backend tại:

```text
http://localhost:3001
```

Nếu muốn đổi URL backend, tạo file `.env.local`:

```bash
VITE_API_BASE_URL=http://localhost:3001
```

## CI/CD Vercel

Repo đã có workflow GitHub Actions tại `.github/workflows/vercel.yml`.

- Pull request: chạy `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, sau đó deploy Preview lên Vercel nếu PR đến từ cùng repo.
- Push vào `main`: chạy các bước CI tương tự, sau đó deploy Production lên Vercel.
- PR từ fork vẫn chạy CI nhưng bỏ qua deploy vì GitHub không cấp secret cho workflow từ fork.

Tạo các GitHub repository secret sau trước khi dùng workflow:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Cách lấy `VERCEL_ORG_ID` và `VERCEL_PROJECT_ID`:

```bash
npx vercel link
```

Sau đó đọc file `.vercel/project.json` được tạo local. File `.vercel` đã nằm trong `.gitignore`, không commit file này.

Nếu dùng workflow này để deploy, nên tắt auto deploy của Vercel Git Integration hoặc chấp nhận việc Vercel có thể build trùng với GitHub Actions. Trên Vercel Project Settings, cấu hình biến môi trường `VITE_API_BASE_URL` trỏ tới backend production nếu backend không chạy cùng domain với frontend.

## Đăng nhập

Tài khoản mặc định sau khi chạy `npm run db:migrate`:

```text
admin / admin123
```

Mật khẩu được hash bằng bcryptjs, token cấp qua JWT (`JWT_SECRET` trong `.env`). Khi đưa lên production hãy đổi mật khẩu admin và cấp `JWT_SECRET` riêng.

## Gửi SMS cảnh báo bằng SIM800L

Hệ thống dùng ESP32 gắn module SIM800L để gửi SMS. Backend không gửi SMS trực tiếp, mà publish yêu cầu gửi SMS qua MQTT. ESP32 subscribe topic đó rồi điều khiển SIM800L bằng AT command.

Luồng hoạt động:

```text
Backend tạo Alert warning/danger
-> Publish MQTT topic <MQTT_TOPIC_PREFIX>/alerts/sms
-> ESP32 nhận message
-> ESP32 gửi AT command cho SIM800L
-> SIM800L gửi SMS tới điện thoại
```

Cấu hình MQTT private, ví dụ HiveMQ Cloud:

```bash
MQTT_BROKER_URL=mqtts://your-cluster.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=your_hivemq_username
MQTT_PASSWORD=your_hivemq_password
MQTT_TOPIC_PREFIX=greenhouse/your-project-id
SENSOR_DATA_TOPIC=greenhouse/your-project-id/sensors
DEVICE_STATUS_TOPIC=greenhouse/your-project-id/device/status
SIM800L_SMS_TOPIC=greenhouse/your-project-id/alerts/sms
SIM800L_PHONE_NUMBERS=+849xxxxxxxx,+849yyyyyyyy
```

Trên Windows PowerShell có thể đặt nhanh:

```powershell
$env:MQTT_BROKER_URL="mqtts://your-cluster.s1.eu.hivemq.cloud:8883"
$env:MQTT_USERNAME="your_hivemq_username"
$env:MQTT_PASSWORD="your_hivemq_password"
$env:MQTT_TOPIC_PREFIX="greenhouse/your-project-id"
$env:SIM800L_SMS_TOPIC="greenhouse/your-project-id/alerts/sms"
$env:SIM800L_PHONE_NUMBERS="+849xxxxxxxx"
npm run server
```

Payload backend gửi cho ESP32:

```json
{
  "id": "alert-id",
  "type": "danger",
  "message": "[GreenHouse] DANGER: Nguy hiểm! Nhiệt độ vượt ngưỡng. Giá trị: 45 °C",
  "sensor_type": "temperature",
  "value": 45,
  "phone_numbers": ["+849xxxxxxxx"],
  "created_date": "2026-04-29T00:00:00.000Z"
}
```

Nếu không đặt `SIM800L_PHONE_NUMBERS`, backend vẫn publish MQTT. Khi đó ESP32 nên dùng số điện thoại mặc định được nạp trong firmware.

## Gợi ý chia phần cứng

- ESP32: làm gateway chính, đọc/gom dữ liệu cảm biến quan trọng và publish `<MQTT_TOPIC_PREFIX>/sensors`.
- ESP8266 #1: điều khiển nhóm tưới nước, ví dụ máy bơm.
- ESP8266 #2: điều khiển nhóm môi trường, ví dụ quạt và đèn.

Topic MQTT gợi ý:

```text
greenhouse/your-project-id/sensors
greenhouse/your-project-id/alerts/sms
greenhouse/your-project-id/control/pump_1
greenhouse/your-project-id/control/mist_1
greenhouse/your-project-id/control/pump_2
greenhouse/your-project-id/control/mist_2
greenhouse/your-project-id/control/fan
greenhouse/your-project-id/control/led
greenhouse/your-project-id/control/gateway
greenhouse/your-project-id/device/status
```

Payload điều khiển zone (ví dụ `pump_1`) gồm `device`, `is_on`, `scope: "zone"`, `node_id: "node-1"`. Thiết bị chung (`fan`, `led`) dùng `scope: "global"`.

Firmware relay controller cần map:
- `pump_1` -> relay bơm Khu 1
- `mist_1` -> relay phun sương Khu 1
- `pump_2` -> relay bơm Khu 2
- `mist_2` -> relay phun sương Khu 2
- `fan` -> relay quạt
- `led` -> relay đèn

Mỗi ESP phải publish trạng thái thật về `<MQTT_TOPIC_PREFIX>/device/status` sau khi nhận lệnh để web biết thiết bị đã chạy thành công. Firmware mẫu nằm ở `firmware/esp32_mqtt_device_status_example/esp32_mqtt_device_status_example.ino`; mẫu này subscribe các topic `control/<device>`, bật/tắt relay rồi publish status chuẩn có `device` và `is_on`.

Kết nối SIM800L với ESP32:

```text
SIM800L VCC -> nguồn riêng 3.7V-4.2V, dòng đỉnh tối thiểu 2A
SIM800L GND -> GND ESP32 và GND nguồn
SIM800L TX  -> RX ESP32
SIM800L RX  -> TX ESP32 qua chia áp
```

Không cấp nguồn SIM800L trực tiếp từ chân 3.3V/5V của ESP32 vì module dễ bị sụt áp và reset khi gửi SMS.

## Kịch bản demo

1. Login bằng tài khoản `admin / admin123`.
2. Mở Dashboard để xem sensor mới nhất, biểu đồ nhỏ, trạng thái thiết bị, cảnh báo gần đây và log điều khiển.
3. Vào Settings -> Ngưỡng cảnh báo, đổi ngưỡng `soil_moisture` hoặc `temperature` để chứng minh Dashboard và backend dùng cùng cấu hình DB.
4. Vào Điều khiển thiết bị, chuyển `pump` sang chế độ `Tự động`.
5. Publish sensor đất khô lên MQTT topic `<MQTT_TOPIC_PREFIX>/sensors`:

```json
{
  "temperature": 30,
  "humidity": 65,
  "soil_moisture": 18,
  "light": 700
}
```

6. Quan sát backend chạy automation và publish lệnh bật bơm lên `<MQTT_TOPIC_PREFIX>/control/pump`.
7. Publish status xác nhận từ ESP lên `<MQTT_TOPIC_PREFIX>/device/status`:

```json
{
  "device": "pump",
  "is_on": true,
  "mode": "auto",
  "online": true
}
```

8. Quay lại web để xem command log đã chuyển sang trạng thái xác nhận, cảnh báo đất khô xuất hiện và hỏi chatbot về tình trạng cây/khu vực đang chọn.

## Test thủ công automation rule an toàn

Endpoint `POST /api/AutomationRule/:id/test` dùng để demo logic rule mà mặc định không publish MQTT. Response có `result.matched`, `result.targetDevice`, `result.action`, `result.skippedReason`, `result.published` và `result.wouldPublish`.

Chuẩn bị token và lấy một rule:

```bash
TOKEN=$(curl -s http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -s http://localhost:3001/api/AutomationRule \
  -H "Authorization: Bearer $TOKEN" | jq '.[0]'
```

Dry-run bằng sensor payload giả lập, thay `<RULE_ID>` bằng id rule vừa lấy:

```bash
curl -s -X POST http://localhost:3001/api/AutomationRule/<RULE_ID>/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"sensor":{"temperature":30,"humidity":65,"soil_moisture":18,"light":700}}' | jq
```

Nếu body không có sensor payload, backend tự dùng latest sensor reading:

```bash
curl -s -X POST http://localhost:3001/api/AutomationRule/<RULE_ID>/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq
```

Kết quả `result.skippedReason` sẽ là `device_manual` nếu rule match nhưng thiết bị đích đang ở chế độ thủ công. Endpoint chỉ publish MQTT khi gửi `confirm=true` và rule đủ điều kiện chạy:

```bash
curl -s -X POST 'http://localhost:3001/api/AutomationRule/<RULE_ID>/test?confirm=true' \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"sensor":{"temperature":30,"humidity":65,"soil_moisture":18,"light":700}}' | jq
```

## Test thủ công alert threshold operators

Backend hỗ trợ các operator cảnh báo: `>`, `>=`, `<`, `<=`, `==`. Operator khác sẽ bị reject với HTTP 400.

Chuẩn bị token và lấy một threshold `soil_moisture`:

```bash
TOKEN=$(curl -s http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

curl -s http://localhost:3001/api/AlertThreshold | jq '.[] | select(.sensor_type=="soil_moisture")'
```

Với mỗi dòng dưới đây, thay `<THRESHOLD_ID>` bằng id vừa lấy, PATCH threshold rồi POST sensor payload tương ứng:

```text
operator  value  sensor soil_moisture  kỳ vọng
>         50     51                    tạo cảnh báo
>=        50     50                    tạo cảnh báo
<         50     49                    tạo cảnh báo
<=        50     50                    tạo cảnh báo
==        50     50                    tạo cảnh báo
```

Ví dụ test `>=`:

```bash
curl -s -X PATCH http://localhost:3001/api/AlertThreshold/<THRESHOLD_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"operator":">=","value":50,"active":true}'

curl -s -X POST http://localhost:3001/api/SensorData \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"temperature":30,"humidity":65,"soil_moisture":50,"light":700}'
```

Test reject operator sai:

```bash
curl -i -X PATCH http://localhost:3001/api/AlertThreshold/<THRESHOLD_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"operator":"!="}'
```

Kết quả mong đợi: HTTP 400 và response có `allowed_operators`. Nếu test liên tiếp không thấy alert mới, xóa alert cũ hoặc chờ hết cooldown 5 phút vì backend chống tạo cảnh báo trùng gần nhau theo sensor và level.

## API chính

- `GET /health`
- `GET /auth/me`
- `POST /chatbot/message`
- `GET /chatbot/plants`
- `POST /chatbot/device-action`
- `GET /api/SensorData/stats/daily?from=&to=`
- `POST /api/Alert/read-all`
- `POST /api/AutomationRule/:id/test`
- `GET /api/:entity`
- `POST /api/:entity`
- `PATCH /api/:entity/:id`
- `DELETE /api/:entity/:id`

Các entity đang có:

- `SensorData`
- `DeviceState`
- `DeviceCommandLog`
- `AutomationRule`
- `Alert`
- `AlertThreshold`
