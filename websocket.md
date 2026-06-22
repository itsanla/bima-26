# Panduan Koneksi WebSocket untuk Modul IoT/GSM

Dokumen ini berisi panduan untuk menghubungkan perangkat IoT (terutama yang menggunakan modul GSM) ke endpoint WebSocket yang baru saja dibuat.

## Informasi Endpoint
- **URL WebSocket:** `ws://187.127.121.123:3000/api/v1/sim800`
- **Port TCP:** `3000`
- **Format Payload:** String JSON atau Text

## Cara Kerja
1. Modul IoT melakukan koneksi TCP ke IP `187.127.121.123` pada port `3000`.
2. Modul IoT mengirimkan HTTP Upgrade request standar untuk memulai sesi WebSocket. (Banyak library yang akan menangani proses *handshake* ini secara otomatis).
3. Setelah terhubung (Connected), modul IoT dapat mengirim data kapan saja menggunakan *WebSocket Text Frame*.
4. Setelah data masuk, Server akan membalas (*Acknowledge*) dengan pesan JSON bahwa data berhasil masuk.

## Format Data (Payload)
Kirimkan payload persis seperti data pada HTTP POST sebelumnya.
Contoh:
```json
{"suhu": 28.5, "timer": "00:00:00", "api": "OFF", "status": "READY", "air_habis": false}
```

## Respon dari Server
Setelah mengirimkan frame berisi data di atas, server akan membalas dengan status:
```json
{
  "success": true,
  "number": 233,
  "data": {
    "suhu": 28.5,
    "timer": "00:00:00",
    "api": "OFF",
    "status": "READY",
    "air_habis": false
  }
}
```

---

## Implementasi di Mikrokontroler (ESP32 / Arduino + Modul GSM)

Jika Anda menggunakan ESP32/Arduino dan Modul GSM (seperti SIM800L atau SIM7000), pendekatan yang paling disarankan adalah menggunakan kombinasi dari library **TinyGSM** (untuk koneksi internet via AT Command) dan **ArduinoWebsockets** (atau library websocket sejenis).

### Prasyarat Library (Arduino IDE)
1. `TinyGSM` oleh Volodymyr Shymanskyy
2. `ArduinoWebsockets` oleh Gil Maimon

### Contoh Kode (Snippet)
Berikut adalah gambaran umum (*pseudocode*/snippet) cara kerjanya menggunakan Arduino C++:

```cpp
#define TINY_GSM_MODEM_SIM800 // Sesuaikan dengan modem Anda
#include <TinyGsmClient.h>
#include <ArduinoWebsockets.h>

// Inisialisasi Serial untuk modul GSM
#define SerialAT Serial1 

TinyGsm modem(SerialAT);
TinyGsmClient client(modem);
websockets::WebsocketsClient wsClient;

const char* websockets_server = "ws://187.127.121.123:3000/api/v1/sim800";

void setup() {
  Serial.begin(115200);
  SerialAT.begin(9600);

  // 1. Inisialisasi modem & sambung ke GPRS jaringan operator
  modem.restart();
  modem.gprsConnect("internet", "", ""); // Sesuaikan APN operator

  // 2. Setup fungsi callback untuk menerima balasan dari server
  wsClient.onMessage([](websockets::WebsocketsMessage message) {
      Serial.print("Balasan dari server: ");
      Serial.println(message.data());
  });

  // 3. Menghubungkan client WebSocket menggunakan koneksi GPRS
  Serial.println("Menghubungkan ke WebSocket Server...");
  bool connected = wsClient.connect(websockets_server);
  
  if(connected) {
      Serial.println("Berhasil terhubung ke WebSocket!");
  } else {
      Serial.println("Gagal terhubung.");
  }
}

void loop() {
  // Wajib dipanggil untuk memonitor koneksi dan pesan masuk
  if(wsClient.available()) {
      wsClient.poll();
  }

  // Contoh: Mengirim data secara berkala tiap 10 detik
  static unsigned long lastSend = 0;
  if(millis() - lastSend > 10000) {
      if(wsClient.available()) {
          // Buat JSON data
          String payload = "{\"suhu\": 29.5, \"timer\": \"00:00:00\", \"api\": \"OFF\", \"status\": \"READY\", \"air_habis\": false}";
          
          // Kirim via web socket
          wsClient.send(payload);
          Serial.println("Data dikirim!");
      }
      lastSend = millis();
  }
}
```

## Catatan Tambahan (Pengguna AT Command Langsung)
Jika tim IoT tidak menggunakan library dan menulis AT Command secara manual (Raw AT Command), mengimplementasikan protokol WebSocket (melakukan hashing key pada saat handshake dan masking frame) dari nol sangatlah rumit. 

Disarankan untuk beralih menggunakan library C/C++ yang sudah mendukung WebSocket (seperti contoh di atas), **ATAU** jika perangkat hanya bisa mengirim TCP Text murni tanpa protokol WebSocket, Anda bisa memberitahu saya untuk membuatkan Socket TCP murni di port yang berbeda. Namun untuk sebagian besar microcontroller saat ini, menggunakan WebSocket sangat memungkinkan melalui library.
