// Temperature and humidity: reads the DHT11 and prints what it measures.
#include <DHT.h>

const int DHT_PIN = 2;
DHT dht(DHT_PIN, DHT11);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);
  float humidity = dht.readHumidity();
  float celsius = dht.readTemperature();
  if (isnan(humidity) || isnan(celsius)) {
    Serial.println("No reading from the DHT11. Check its wiring.");
    return;
  }
  Serial.print("Temperature: ");
  Serial.print(celsius);
  Serial.print(" C, humidity: ");
  Serial.print(humidity);
  Serial.println(" %");
}
