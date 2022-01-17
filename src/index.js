import "./js/hammer.js";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";


const threeDigitalTemplate = document.createElement("template");
threeDigitalTemplate.innerHTML = `

<style>

.centerFlex{
  position: absolute;
  display:flex;
  height: 100%;
  width: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  align-content: center;
  top: 0;
  gap:2em;
  text-align: center;
  gap: 2em;
  left: 0;
}
.three-digital-close-ar{
  position: absolute;
  top: 0;
  right: 0;
  padding: 28px;
  font-size: 2em;
}

.three-digital-root{
  display:none;
}

.three-digital-interactive{
  display:none;
  align-content: center;
  width: 100%;
  text-align: center;
  position: absolute;
  top: 20px;
  opacity: 50%;
}

.three-digital-scan {
}
</style>
<div class="three-digital-root">

  <div class="three-digital-loading centerFlex">
    <div>Loading Model</div>
    <div class="three-digital-loading-amount" > 00%</div>
    <div class="three-digital-scan">Keep Move your Camera <br> Point at a clear flat area</div>
  </div>



  <div class="three-digital-interactive"> One finger to Drag<br> Two fingers to Rotate and Scale <br> Double Tap scale to 100%</div>
  <div class="three-digital-close-ar ">&#10006;</div>
</div>


<slot id="ar-button" name="ar-button">AR Not Support</slot>

`;

class ThreeDigital extends HTMLElement {
  constructor() {
    super();

    // cutom tag variables
    const self = this;
    self.attachShadow({ mode: "open" });
    self.shadowRoot.appendChild(threeDigitalTemplate.content.cloneNode(true));
    const threeDigitalRoot = self.shadowRoot.querySelector(
      ".three-digital-root"
    );
    const loadingInfo = self.shadowRoot.querySelector(".three-digital-loading");
    const closeArButton = self.shadowRoot.querySelector(
      ".three-digital-close-ar"
    );
    const enterArButton = self.shadowRoot.querySelector("#ar-button");
    // const enterArButton = self.shadowRoot.querySelector("#three-digital-ar-button");
    const loadingAmmount = self.shadowRoot.querySelector(
      ".three-digital-loading-amount"
    );
    const gestureLayer = self.shadowRoot.querySelector(
      ".three-digital-interactive"
    );
    const interactiveInfo = self.shadowRoot.querySelector(
      ".three-digital-interactive"
    );
    const autoRotation = self.hasAttribute("auto-rotate");
    const enviromentMap = self.hasAttribute("environment-hdr")
      ? self.getAttribute("environment-hdr")
      : false;

    const glbSrc = self.getAttribute("glb-src");
    const iosSrc = self.getAttribute("ios-src");
    // xr session variables
    let scene, renderer, camera;
    let gl = null;
    let localReferenceSpace = null;
    let viewerReferenceSpace = null;

    let hitTestSourceRequested = false;
    let hitTestSource = null;
    let canvas;
    let arScene = new THREE.Group();

    let rayCasterProxy;
    let envMap;
    let offsetOrigin = new THREE.Vector4(0, 0, 0, 1);
    let offsetDirection = new THREE.Vector4(0, 0, -1, 0);
    const raycaster = new THREE.Raycaster();
    let placeMode = true;

    // gesture Variable
    let deltalScale = 0;
    let deltalRotate = 0;
    let preRotate = 0;
    let initialScale;
    let preScale = 0;
    let pressed = false;
    let mouse = new THREE.Vector2();
    let initialPlace = true;
    let currentTouch;
    let reticle;
    let deviceOS;


    main();
    async function main() {
      const getMobileOS = () => {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) {
          return "Android";
        } else if (
          /iPad|iPhone|iPod/.test(ua) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
        ) {
          return "iOS";
        }
        return "Other";
      };

      deviceOS = getMobileOS();

      if (deviceOS === "Android") {
        if (window.location.protocol === "https:") {
          const isARSupported = await window.navigator.xr.isSessionSupported(
            "immersive-ar"
          );
          if (isARSupported && glbSrc) {
            enterArButton.addEventListener("click", onSessionStarted);
          } else {
            enterArButton.disabled = true;
            console.log("AR Not Support");
          }
        } else {
          enterArButton.disabled = true;
          console.log("Use HTTPS");
          
        }
      } else if (deviceOS === "iOS" && iosSrc) {
        enterArButton.addEventListener("click", enterIosAR);
      } else {
        console.log("Your Device does Not Support AR");
      }
    }

    function enterIosAR() {
      const arHref = iosSrc;
      const anchor = document.createElement("a");
      anchor.setAttribute("rel", "ar");
      anchor.appendChild(document.createElement("img"));
      anchor.setAttribute("href", arHref);
      anchor.click();
    }

    async function onSessionStarted(session) {
      // loadingInfo.style.display = "flex"
      initialPlace = true;

      threeDigitalRoot.style.display = "block";
      loadingInfo.style.display = "flex";
      enterArButton.style.display = "none";
      interactiveInfo.style.display = "none";

      canvas = document.createElement("canvas");
      gl = canvas.getContext("webgl", {
        xrCompatible: true,
      });

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20
      );

      // scene.background = new THREE.Color( 0xff0000 );

      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.outputEncoding = THREE.sRGBEncoding;
      document.body.appendChild(renderer.domElement);

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const light = new THREE.DirectionalLight(0xffffff, 1, 100);
      light.position.set(0, 1, 0); //default; light shining from top
      light.castShadow = true; // default false
      scene.add(light);

      if (enviromentMap) {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        new RGBELoader()
          .setDataType(THREE.UnsignedByteType)
          .load(enviromentMap, (texture) => {
            envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.environment = envMap;
            // scene.background = envMap;
            texture.dispose();
            pmremGenerator.dispose();
          });
      } else {
        const ambientlight = new THREE.AmbientLight(0xffffff); // soft white light
        scene.add(ambientlight);
      }

      arScene;
      scene.add(arScene);

      window.addEventListener("resize", onWindowResize);
      const gltfLoader = new GLTFLoader();
      document.addEventListener("keydown", function (e) {
        if (
          (e.key == "Escape" || e.key == "Esc" || e.keyCode == 27) &&
          e.target.nodeName == "BODY"
        ) {
          e.preventDefault();
          session.end();
        }
      });

      closeArButton.addEventListener("click", () => {
        session.end();
      });

      function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }

      function onSessionEnded(/*event*/) {
        session.removeEventListener("end", onSessionEnded);
        setTimeout(() => {
          renderer.domElement.remove();
        }, 100);
        enterArButton.style.display = "block";
        threeDigitalRoot.style.display = "none";
      }

      const material2 = new THREE.MeshBasicMaterial({
        color: 0xffffff * Math.random(),
        side: THREE.DoubleSide,
      });
      arScene.visible = false;

      session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: self },
      });
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

      localReferenceSpace = await session.requestReferenceSpace("local");
      viewerReferenceSpace = await session.requestReferenceSpace("viewer");

      session.addEventListener("end", onSessionEnded);
      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(session);
      session.requestAnimationFrame(onXRFrame);

      gltfLoader.load(
        // resource URL
        glbSrc,
        // called when the resource is loaded
        function (gltf) {
          var bbox = new THREE.Box3().setFromObject(gltf.scene);
          const bboxCenter = new THREE.Vector3();
          bbox.getCenter(bboxCenter);
          const width = bbox.max.x - bbox.min.x;
          const heigh = bbox.max.y - bbox.min.y;
          const depth = bbox.max.z - bbox.min.z;
          const geometry = new THREE.BoxGeometry(width, heigh, depth);
          const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
          rayCasterProxy = new THREE.Mesh(geometry, material);
          rayCasterProxy.position.copy(bboxCenter);
          rayCasterProxy.visible = false;

          arScene.add(rayCasterProxy);
          arScene.add(gltf.scene);

          const planeGeometry = new THREE.PlaneGeometry(width * 2, depth * 2);
          planeGeometry.rotateX(-Math.PI / 2);
          const planeMaterial = new THREE.ShadowMaterial();
          planeMaterial.opacity = 0.9;
          const plane = new THREE.Mesh(planeGeometry, planeMaterial);
          plane.receiveShadow = true;
          arScene.add(plane);

          const reticleGeo = new THREE.RingGeometry(
            width * 1.1,
            width * 1.2,
            4
          );
          reticleGeo.rotateX(-Math.PI / 2);
          reticleGeo.rotateY(-Math.PI / 4);

          reticle = new THREE.Mesh(reticleGeo);
          arScene.add(reticle);
          reticle.visible = false;

          gltf.scene.traverse((child) => {
            if (
              child instanceof THREE.Mesh &&
              child.material instanceof THREE.MeshStandardMaterial
            ) {
              if (enviromentMap) {
                child.material.envMap = envMap;
              }

              child.castShadow = true;
              child.receiveShadow = false;
              // child.material.envMapIntensity = 1.5
            }
          });
        },
        // called while loading is progressing
        function (xhr) {
          console.log((xhr.loaded / xhr.total) * 100 + "% loaded");

          const amount = Math.floor((xhr.loaded / xhr.total) * 100) + "%";

          loadingAmmount.innerHTML = amount;
        },
        // called when loading has errors
        function (error) {
          console.log("An error happened loading GLTF file");
        }
      );

      var myElement = document.body;
      var hammertime = new Hammer(myElement);

      const Pinch = new Hammer.Pinch();
      const Rotate = new Hammer.Rotate();
      Pinch.recognizeWith(Rotate);

      hammertime.get("pinch").set({ enable: true });
      hammertime.get("rotate").set({ enable: true });
      hammertime.on("pinchstart rotatestart", (ev) => {
        preRotate = ev.rotation;
        preScale = ev.scale;
        if (arScene) {
          initialScale = arScene.scale.y;
        }
      });

      hammertime.on("pinchmove rotatemove", (ev) => {
        deltalRotate = ev.rotation - preRotate;
        preRotate = ev.rotation;
        deltalScale = ev.scale - preScale;
        preScale = ev.scale;
        const deltaScale = initialScale * ev.scale;

        arScene.scale.set(deltaScale, deltaScale, deltaScale);

        arScene.rotateY(deltalRotate * 0.04);
      });
      hammertime.on("pinchend rotateend", (ev) => {});

      window.addEventListener("touchmove", (event) => {
        if (event.touches.length === 1) {
          onMouseMove(event.touches[0]);
          pressed = true;
          hitTestSourceRequested = false;
        }
      });

      window.addEventListener("touchstart", (event) => {
        if (event.touches.length === 1) {
          onMouseMove(event.touches[0]);
          // pressed = true;
          const touchTime = Date.now() - currentTouch;
          if (touchTime < 150) {
            arScene.scale.set(1, 1, 1);
          }
        }
      });

      window.addEventListener("touchend", (event) => {
        hitTestSourceRequested = true;
        placeMode = false;
        pressed = false;
        currentTouch = Date.now();
        reticle.visible = false;
      });

      function onMouseMove(event) {
        mouse = {
          x: (event.screenX / screen.width) * 2 - 1,
          y: -(event.screenY / screen.height) * 2 + 1,
        };
      }

      function onXRFrame(t, frame) {
        let session = frame.session;
        session.requestAnimationFrame(onXRFrame);
        raycaster.setFromCamera(mouse, camera);
        if (pressed) {
          raycaster.setFromCamera(mouse, camera);

          var intersects = raycaster.intersectObject(rayCasterProxy);
          if (intersects.length > 0) {
            placeMode = true;
          }
        }

        if (placeMode) {
          offsetOrigin = camera.position.clone();
          offsetDirection = new THREE.Vector4(
            mouse.x * 0.35,
            mouse.y * 0.65,
            -1,
            0
          ).normalize();
        } else {
          offsetOrigin = new THREE.Vector4(0, 0, 0, 1);
          offsetDirection = new THREE.Vector4(0, 0, -1, 0);
        }

        if (hitTestSourceRequested === false) {
          let XrayOffset = new XRRay(offsetOrigin, offsetDirection);

          session
            .requestHitTestSource({
              space: viewerReferenceSpace,
              offsetRay: XrayOffset,
            })
            .then((source) => {
              hitTestSource = source;
            });
        }

        if (hitTestSource && placeMode) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length) {
            const hit = hitTestResults[0];

            const positions =
              hit.getPose(localReferenceSpace).transform.position;
            arScene.position.copy(positions);
            interactiveInfo.style.display = "block";
            reticle.visible = true;
            if (initialPlace) {
              initialPlace = false;
              placeMode = false;
              loadingInfo.style.display = "none";
              interactiveInfo.style.display = "block";
              reticle.visible = false;
              arScene.visible = true;
            }
          }
        }

        renderer.render(scene, camera);

        if (autoRotation) {
          arScene.rotation.y += 0.01;
        }
      }
    }
  }
}

customElements.define("three-digital-ar", ThreeDigital);
