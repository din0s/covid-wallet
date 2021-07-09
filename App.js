import * as DocumentPicker from "expo-document-picker";
import * as b64 from "base-64";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

import {
  Button,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import React, { useEffect, useState } from "react";

import AnimatedSplash from "react-native-animated-splash-screen";
import AsyncStorage from "@react-native-community/async-storage";
import { BarCodeScanner } from "expo-barcode-scanner";
import { FileSystem } from "react-native-unimodules";
import QRCode from "react-native-qrcode-svg";
import { StatusBar } from "expo-status-bar";
import Storage from "react-native-storage";
import jsQR from "jsqr";
import { pdfjsWorker } from "pdfjs-dist/legacy/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  Platform.OS === "web"
    ? `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
    : pdfjsWorker;

const storage = new Storage({
  size: 1,
  storageBackend: Platform.OS === "web" ? window.localStorage : AsyncStorage,
  defaultExpires: null,
});

const Separator = () => <View style={styles.separator} />;

const App = () => {
  const [appLoaded, setAppLoaded] = useState(false);

  const [hasCamPerm, setHasCamPerm] = useState(false);
  const [openQrScanner, setOpenQrScanner] = useState(false);

  const [qrDim, setQrDim] = useState(404);
  const [qrContent, setQrContent] = useState("");

  useEffect(() => {
    initLoad();
  }, []);

  const initLoad = async () => {
    const value = await AsyncStorage.getItem("@qr");
    if (value !== null) {
      setQrContent(value);
    }

    if (Platform.OS !== "web") {
      // no QR in browser
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasCamPerm(status === "granted");
    }

    setAppLoaded(true);
  };

  const scanQr = ({ data }) => {
    verifyAndSetQrContent(data);
  };

  const verifyAndSetQrContent = (data) => {
    if (data.startsWith("HC1:")) {
      setQrContent(data);
      AsyncStorage.setItem("@qr", data);
    }
  };

  const importPdf = async () => {
    const pdfFile = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: false,
    });

    if (pdfFile.type === "success") {
      let content;
      switch (Platform.OS) {
        case "android":
          const fileUri = `${FileSystem.documentDirectory}${pdfFile.name}`;
          await FileSystem.copyAsync({ from: pdfFile.uri, to: fileUri });
          content = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          break;

        case "web":
          content = await FileSystem.getContentUriAsync(pdfFile.uri);
          break;

        default:
          alert("Not implemented yet!");
          return;
      }

      const contentB64 = content.substring(
        "data:application/pdf;base64,".length
      );

      const bin = b64.decode(contentB64);
      const binArr = new Uint8Array(new ArrayBuffer(bin.length));
      for (let i = 0; i < bin.length; i++) {
        binArr[i] = bin.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument(binArr).promise;
      const page = await pdf.getPage(1);
      const ops = await page.getOperatorList();

      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] == pdfjsLib.OPS.paintImageXObject) {
          const objName = ops.argsArray[i][0];
          const { data } = page.objs._objs[objName];
          decodeQr(data);
        }
      }
    }
  };

  const decodeQr = (qrData) => {
    const { data, height, width } = qrData;

    const arr = [];
    for (let i = 0; i < data.length; i += 3) {
      arr.push(data[i]);
      arr.push(data[i + 1]);
      arr.push(data[i + 2]);
      arr.push(255); // add alpha value
    }

    const clampArr = Uint8ClampedArray.from(arr);
    const qr = jsQR(clampArr, width, height);

    if (qr) {
      setQrDim(height);
      verifyAndSetQrContent(qr.data);
    }
  };

  const resetAll = () => {
    setQrContent("");
    setOpenQrScanner(false);
    AsyncStorage.clear();
  };

  const getView = () => {
    if (qrContent !== "" && qrDim) {
      const { width, height } = Dimensions.get("window");
      return (
        <View style={styles.container}>
          <Text style={styles.title} children={"My COVID-19 Green Pass"} />
          <Separator />
          <QRCode
            value={qrContent}
            size={Math.min(qrDim, width - 8, height - 16)}
            quietZone={8}
          />
          <Separator />
          <Button onPress={resetAll} title="Reset" color="#ed4245" />
          <StatusBar style="auto" />
        </View>
      );
    }

    if (openQrScanner) {
      return (
        <View style={styles.qr}>
          <BarCodeScanner
            onBarCodeScanned={scanQr}
            style={StyleSheet.absoluteFillObject}
          />
          <Button
            onPress={() => setOpenQrScanner(false)}
            title="Cancel"
            color="#ed4245"
          />
          <StatusBar style="auto" />
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <Text
          styles={styles.title}
          children={"How would you like to import your green pass?"}
        />
        <Separator />
        {hasCamPerm && (
          <Button
            onPress={() => setOpenQrScanner(true)}
            title="Scan QR code"
            color="#57f287"
          />
        )}
        <Separator />
        <Button onPress={importPdf} title="Read from PDF" color="#5865f2" />
        <StatusBar style="auto" />
      </View>
    );
  };

  return (
    <AnimatedSplash
      translucent={true}
      isLoaded={appLoaded}
      logoImage={require("./assets/virus.png")}
    >
      {getView()}
    </AnimatedSplash>
  );
};

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  qr: {
    flex: 1,
    flexDirection: "column-reverse",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 8,
  },
});
