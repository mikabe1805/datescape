import * as pc from "playcanvas";
import {
  DEFAULT_AVATAR_APPEARANCE,
  type AvatarAppearance,
  type ActivityState,
  type ExpeditionStageId,
  type ExpeditionState,
  type ExpeditionTargetId,
  type JourneyLandmarkId,
  type JourneyState,
  type PublicEventState,
  type QuestState,
} from "./bridge";
import { selectListeningPartner } from "./activityAnchors";
import arrivalConservatoryUrl from "../../art/afterlight/arrival_conservatory/output/arrival_conservatory_hero_kit.draco.glb?url";
import lanternMarketUrl from "../../art/afterlight/lantern_market/output/afterlight_lantern_market_kit.runtime.draco.glb?url";
import resonanceGardenUrl from "../../art/afterlight/resonance_garden/output/afterlight_resonance_garden_kit.runtime.draco.glb?url";
import heroAvatarUrl from "../../art/afterlight/avatar/output/afterlight_hero_avatar.runtime.draco.glb?url";
import belfastSkyUrl from "../../art/afterlight/environment/belfast_sunset_puresky_1k.hdr?url";

type Palette = {
  pearl: pc.Color;
  stone: pc.Color;
  bronze: pc.Color;
  glass: pc.Color;
  foliage: pc.Color;
  warm: pc.Color;
  coral: pc.Color;
  water: pc.Color;
};

const palette: Palette = {
  pearl: new pc.Color(0.68, 0.73, 0.74),
  stone: new pc.Color(0.075, 0.13, 0.17),
  bronze: new pc.Color(0.32, 0.22, 0.12),
  glass: new pc.Color(0.2, 0.49, 0.55),
  foliage: new pc.Color(0.08, 0.34, 0.28),
  warm: new pc.Color(1, 0.45, 0.18),
  coral: new pc.Color(0.55, 0.29, 0.32),
  water: new pc.Color(0.055, 0.23, 0.3),
};

function makeMaterial(
  name: string,
  color: pc.Color,
  options: {
    metalness?: number;
    gloss?: number;
    emissive?: pc.Color;
    opacity?: number;
  } = {},
) {
  const material = new pc.StandardMaterial();
  material.name = name;
  material.diffuse = color;
  material.metalness = options.metalness ?? 0;
  material.gloss = options.gloss ?? 0.45;
  if (options.emissive) {
    material.emissive = options.emissive;
    material.emissiveIntensity = 2.2;
  }
  if (options.opacity !== undefined) {
    material.opacity = options.opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = options.opacity > 0.9;
  }
  material.update();
  return material;
}

function primitive(
  app: pc.Application,
  name: string,
  type: "box" | "cylinder" | "sphere" | "capsule" | "plane",
  material: pc.StandardMaterial,
  position: [number, number, number],
  scale: [number, number, number],
  euler?: [number, number, number],
  parent: pc.Entity = app.root,
) {
  const entity = new pc.Entity(name);
  entity.addComponent("render", {
    type,
    material,
    castShadows: true,
    receiveShadows: true,
  });
  parent.addChild(entity);
  entity.setLocalPosition(...position);
  entity.setLocalScale(...scale);
  if (euler) entity.setLocalEulerAngles(...euler);
  return entity;
}

function lantern(
  app: pc.Application,
  x: number,
  y: number,
  z: number,
  material: pc.StandardMaterial,
) {
  return primitive(
    app,
    "Lantern",
    "sphere",
    material,
    [x, y, z],
    [0.14, 0.14, 0.14],
  );
}

function loadAsset(app: pc.Application, asset: pc.Asset) {
  return new Promise<pc.Asset>((resolve, reject) => {
    const onError = (error: unknown) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    asset.ready((readyAsset) => {
      asset.off("error", onError);
      resolve(readyAsset);
    });
    asset.once("error", onError);
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

function tuneAuthoredMaterials(root: pc.Entity) {
  const materials = new Set<pc.StandardMaterial>();
  const renderComponents = root.findComponents(
    "render",
  ) as pc.RenderComponent[];
  renderComponents.forEach((component) => {
    component.meshInstances.forEach((instance) => {
      if (instance.material instanceof pc.StandardMaterial)
        materials.add(instance.material);
    });
  });

  materials.forEach((material) => {
    switch (material.name) {
      case "MAT_ALC_PearlStucco":
        material.diffuse.copy(palette.pearl);
        break;
      case "MAT_ALC_TidalWater":
        material.diffuse.copy(palette.water);
        material.emissive.set(0.012, 0.055, 0.07);
        material.opacity = 0.9;
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        break;
      case "MAT_ALC_SeaGlass":
        material.diffuse.copy(palette.glass);
        material.opacity = 0.24;
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        break;
      case "MAT_ALC_NightStone":
        material.diffuse.copy(palette.stone);
        break;
      case "MAT_ALC_CoralCeramic":
        material.diffuse.copy(palette.coral);
        break;
      case "MAT_ALC_Bronze":
        material.diffuse.copy(palette.bronze);
        break;
      case "MAT_ALC_GardenLeaf":
        material.diffuse.copy(palette.foliage);
        break;
      case "MAT_ALC_LanternGlow":
        material.diffuse.set(0.8, 0.39, 0.15);
        material.emissive.set(1, 0.28, 0.07);
        material.emissiveIntensity = 0.65;
        break;
      default:
        break;
    }
    material.update();
  });
}

function tagAudioMarkers(root: pc.Entity, tag: string) {
  const visit = (entity: pc.Entity) => {
    if (entity.name.startsWith("SFX_")) entity.tags.add(tag);
    (entity.children as pc.Entity[]).forEach(visit);
  };
  visit(root);
}

type ModuleTransform = {
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

function styleModule(
  entity: pc.Entity,
  transform: ModuleTransform,
  parent: pc.Entity,
) {
  entity.reparent(parent);
  entity.name = transform.name;
  entity.enabled = true;
  entity.setLocalPosition(...transform.position);
  entity.setLocalEulerAngles(...transform.rotation);
  entity.setLocalScale(...transform.scale);
  return entity;
}

async function installAuthoredArrival(
  app: pc.Application,
  fallback: pc.Entity[],
) {
  const asset = new pc.Asset("Arrival Conservatory Hero Kit", "container", {
    url: arrivalConservatoryUrl,
    filename: "arrival_conservatory_hero_kit.draco.glb",
  });
  await loadAsset(app, asset);
  const container = asset.resource as pc.ContainerResource;
  const instance = container.instantiateRenderEntity();
  const requiredModules = [
    "ALC_Arch_Pearl_A",
    "ALC_Pier_Pearl_A",
    "ALC_Canopy_SeaGlass_A",
    "ALC_Rib_Bronze_A",
    "ALC_Beam_Bronze_A",
    "ALC_Planter_Coral_A",
    "ALC_BenchLantern_A",
    "ALC_GroundWaterTrim_A",
  ];
  const moduleSources = new Map<string, pc.Entity>();
  for (const name of requiredModules) {
    const entity = instance.findByName(name) as pc.Entity | null;
    if (!entity) {
      instance.destroy();
      throw new Error(`Arrival module '${name}' was not found in the GLB`);
    }
    moduleSources.set(name, entity);
  }

  const assembly = new pc.Entity("Arrival Authored v01");
  app.root.addChild(assembly);

  const source = (name: string) => moduleSources.get(name)!;
  const duplicate = (entity: pc.Entity, transform: ModuleTransform) =>
    styleModule(entity.clone(), transform, assembly);

  try {
    const arch = styleModule(
      source("ALC_Arch_Pearl_A"),
      {
        name: "Arrival Gateway Arch",
        position: [0, 0.18, 21.15],
        rotation: [0, 0, 0],
        scale: [1.5, 1.45, 1.1],
      },
      assembly,
    );
    duplicate(arch, {
      name: "Market Threshold Arch",
      position: [0, 0.16, 14.4],
      rotation: [0, 0, 0],
      scale: [1.2, 1.15, 1],
    });

    const pier = styleModule(
      source("ALC_Pier_Pearl_A"),
      {
        name: "Arrival Pier L",
        position: [-4.35, 0.18, 21.25],
        rotation: [0, 0, 0],
        scale: [1.25, 1.45, 1.25],
      },
      assembly,
    );
    duplicate(pier, {
      name: "Arrival Pier R",
      position: [4.35, 0.18, 21.25],
      rotation: [0, 180, 0],
      scale: [1.25, 1.45, 1.25],
    });

    const canopy = styleModule(
      source("ALC_Canopy_SeaGlass_A"),
      {
        name: "Arrival Canopy 01",
        position: [0, 0.2, 23.45],
        rotation: [0, 0, 0],
        scale: [1.45, 1.4, 1.05],
      },
      assembly,
    );
    duplicate(canopy, {
      name: "Arrival Canopy 02",
      position: [0, 0.2, 25.95],
      rotation: [0, 0, 0],
      scale: [1.45, 1.4, 1.05],
    });
    duplicate(canopy, {
      name: "Arrival Canopy 03",
      position: [0, 0.2, 28.45],
      rotation: [0, 0, 0],
      scale: [1.45, 1.4, 1.05],
    });

    const rib = styleModule(
      source("ALC_Rib_Bronze_A"),
      {
        name: "Arrival Rib Front",
        position: [0, 0.2, 22.25],
        rotation: [0, 0, 0],
        scale: [1.45, 1.4, 1.05],
      },
      assembly,
    );
    duplicate(rib, {
      name: "Arrival Rib Rear",
      position: [0, 0.2, 29.75],
      rotation: [0, 0, 0],
      scale: [1.45, 1.4, 1.05],
    });

    const beam = styleModule(
      source("ALC_Beam_Bronze_A"),
      {
        name: "Arrival Glow Beam L",
        position: [-2.72, 1.18, 29.9],
        rotation: [0, 90, 0],
        scale: [2.2, 1, 1],
      },
      assembly,
    );
    duplicate(beam, {
      name: "Arrival Glow Beam R",
      position: [2.72, 1.18, 22.35],
      rotation: [0, -90, 0],
      scale: [2.2, 1, 1],
    });

    const planter = styleModule(
      source("ALC_Planter_Coral_A"),
      {
        name: "Arrival Planter L Front",
        position: [-4.25, 0.24, 23.4],
        rotation: [0, 12, 0],
        scale: [1.15, 1.15, 1.15],
      },
      assembly,
    );
    [
      {
        name: "Arrival Planter R Front",
        position: [4.25, 0.24, 23.4],
        rotation: [0, -12, 0],
        scale: [1.15, 1.15, 1.15],
      },
      {
        name: "Arrival Planter L Rear",
        position: [-4, 0.24, 28.4],
        rotation: [0, -8, 0],
        scale: [0.92, 0.92, 0.92],
      },
      {
        name: "Arrival Planter R Rear",
        position: [4, 0.24, 28.4],
        rotation: [0, 8, 0],
        scale: [0.92, 0.92, 0.92],
      },
    ].forEach((transform) => duplicate(planter, transform as ModuleTransform));

    const bench = styleModule(
      source("ALC_BenchLantern_A"),
      {
        name: "Arrival Bench L",
        position: [-4.5, 0.2, 26.15],
        rotation: [0, 90, 0],
        scale: [1, 1, 1],
      },
      assembly,
    );
    duplicate(bench, {
      name: "Arrival Bench R",
      position: [4.5, 0.2, 26.15],
      rotation: [0, -90, 0],
      scale: [1, 1, 1],
    });

    const trim = styleModule(
      source("ALC_GroundWaterTrim_A"),
      {
        name: "Arrival Water Trim L",
        position: [-3.45, 0.18, 30],
        rotation: [0, 90, 0],
        scale: [2, 1, 1],
      },
      assembly,
    );
    duplicate(trim, {
      name: "Arrival Water Trim R",
      position: [3.45, 0.18, 22],
      rotation: [0, -90, 0],
      scale: [2, 1, 1],
    });

    tuneAuthoredMaterials(assembly);
    tagAudioMarkers(assembly, "arrival:audio-anchor");
    fallback.forEach((entity) => entity.destroy());
    instance.destroy();
    return assembly;
  } catch (error) {
    assembly.destroy();
    instance.destroy();
    throw error;
  }
}

type AuthoredModuleLayout = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

// The manifest is authored in Blender Z-up. These are the documented layout
// positions converted to PlayCanvas Y-up: [x, source z, -source y]. Keeping
// the root unrotated and at unit scale preserves the authored 4.2 m path.
const MARKET_MODULE_LAYOUT: Record<string, AuthoredModuleLayout> = {
  LM_GroundRibbon_A: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_Stall_Courtyard_A: {
    position: [-4.25, 0, -2.75],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_Stall_Courtyard_B: {
    position: [4.25, 0, -2.1],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_CounterDress_A: {
    position: [-4.43, 0.97, -2.33],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_LanternSpine_A: {
    position: [0, 0, -0.15],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_CommunalTable_A: {
    position: [3.45, 0, 0.9],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_TastingRail_A: {
    position: [-4.1, 0, 0.72],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_ListeningCrescent_A: {
    position: [-3.55, 0, 3.55],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_PlanterScreen_A: {
    position: [4.25, 0, 3.75],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  LM_ThresholdSign_A: {
    position: [6.35, 0, 4.55],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
};

const MARKET_REQUIRED_MATERIALS = [
  "MAT_AFT_WetNightStone",
  "MAT_AFT_BlueBlackStone",
  "MAT_AFT_TidalRill",
  "MAT_AFT_AgedBronze",
  "MAT_AFT_PearlLimewash",
  "MAT_AFT_GlazedSeaCeramic",
  "MAT_AFT_CanvasClay",
  "MAT_AFT_CanvasOat",
  "MAT_AFT_WarmMarketWood",
  "MAT_AFT_SmokedSeaGlass",
  "MAT_AFT_LanternWarm",
  "MAT_AFT_PlanterSoil",
  "MAT_AFT_GardenLeafDark",
  "MAT_AFT_GardenLeafMint",
];

function tuneMarketMaterials(root: pc.Entity) {
  const materials = new Map<string, pc.StandardMaterial>();
  const renderComponents = root.findComponents(
    "render",
  ) as pc.RenderComponent[];
  renderComponents.forEach((component) => {
    component.meshInstances.forEach((meshInstance) => {
      if (meshInstance.material instanceof pc.StandardMaterial) {
        materials.set(meshInstance.material.name, meshInstance.material);
      }
    });
  });

  const missing = MARKET_REQUIRED_MATERIALS.filter(
    (name) => !materials.has(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Lantern Market materials were not found in the GLB: ${missing.join(", ")}`,
    );
  }

  materials.forEach((material, name) => {
    material.opacity = 1;
    material.blendType = pc.BLEND_NONE;
    material.depthWrite = true;
    material.metalness = 0;
    material.emissive.set(0, 0, 0);
    material.emissiveIntensity = 1;

    switch (name) {
      case "MAT_AFT_WetNightStone":
        material.diffuse.copy(palette.stone);
        material.gloss = 0.84;
        material.metalness = 0.06;
        break;
      case "MAT_AFT_BlueBlackStone":
        material.diffuse.set(0.055, 0.115, 0.145);
        material.gloss = 0.58;
        break;
      case "MAT_AFT_TidalRill":
        material.diffuse.copy(palette.water);
        material.gloss = 0.96;
        material.metalness = 0.08;
        material.emissive.set(0.008, 0.03, 0.04);
        material.emissiveIntensity = 0.55;
        material.opacity = 0.82;
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        break;
      case "MAT_AFT_AgedBronze":
        material.diffuse.copy(palette.bronze);
        material.gloss = 0.66;
        material.metalness = 0.78;
        break;
      case "MAT_AFT_PearlLimewash":
        material.diffuse.copy(palette.pearl);
        material.gloss = 0.24;
        break;
      case "MAT_AFT_GlazedSeaCeramic":
        material.diffuse.set(0.09, 0.4, 0.4);
        material.gloss = 0.82;
        material.metalness = 0.04;
        break;
      case "MAT_AFT_CanvasClay":
        material.diffuse.copy(palette.coral);
        material.gloss = 0.2;
        break;
      case "MAT_AFT_CanvasOat":
        material.diffuse.set(0.63, 0.55, 0.43);
        material.gloss = 0.18;
        break;
      case "MAT_AFT_WarmMarketWood":
        material.diffuse.set(0.24, 0.12, 0.075);
        material.gloss = 0.4;
        break;
      case "MAT_AFT_SmokedSeaGlass":
        material.diffuse.copy(palette.glass);
        material.gloss = 0.91;
        material.opacity = 0.34;
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        break;
      case "MAT_AFT_LanternWarm":
        material.diffuse.set(0.85, 0.39, 0.13);
        material.gloss = 0.62;
        material.emissive.set(1, 0.25, 0.055);
        material.emissiveIntensity = 1.55;
        break;
      case "MAT_AFT_PlanterSoil":
        material.diffuse.set(0.07, 0.045, 0.03);
        material.gloss = 0.12;
        break;
      case "MAT_AFT_GardenLeafDark":
        material.diffuse.copy(palette.foliage);
        material.gloss = 0.24;
        break;
      case "MAT_AFT_GardenLeafMint":
        material.diffuse.set(0.2, 0.5, 0.42);
        material.gloss = 0.28;
        break;
      default:
        break;
    }
    material.update();
  });
}

const MARKET_MARKER_TAGS: Array<[string, string]> = [
  ["COL_", "market:collision"],
  ["INT_", "market:interaction"],
  ["NAV_", "market:nav-keep-clear"],
  ["SOC_", "market:social-volume"],
  ["SFX_", "market:audio-anchor"],
  ["LGT_", "market:light-anchor"],
  ["SOCKET_", "market:socket"],
];

function tagMarketMarkers(root: pc.Entity) {
  const visit = (entity: pc.Entity) => {
    const marker = MARKET_MARKER_TAGS.find(([prefix]) =>
      entity.name.startsWith(prefix),
    );
    if (marker) entity.tags.add(marker[1]);
    (entity.children as pc.Entity[]).forEach(visit);
  };
  visit(root);
}

function addMarketPocketLights(parent: pc.Entity) {
  const pocketLights: Array<{
    name: string;
    position: [number, number, number];
    intensity: number;
    range: number;
  }> = [
    {
      name: "Market tasting warmth",
      position: [-4.1, 2.45, 0.72],
      intensity: 0.74,
      range: 5,
    },
    {
      name: "Market table warmth",
      position: [3.45, 2.4, 0.9],
      intensity: 0.82,
      range: 5.2,
    },
    {
      name: "Market listening warmth",
      position: [-3.55, 2.25, 3.55],
      intensity: 0.62,
      range: 4.8,
    },
  ];

  pocketLights.forEach((spec) => {
    const light = new pc.Entity(spec.name);
    light.addComponent("light", {
      type: "omni",
      color: new pc.Color(1, 0.39, 0.17),
      intensity: spec.intensity,
      range: spec.range,
      castShadows: false,
    });
    parent.addChild(light);
    light.setLocalPosition(...spec.position);
  });
}

async function installAuthoredMarket(
  app: pc.Application,
  fallback: pc.Entity[],
  fallbackLight: pc.Entity,
) {
  const asset = new pc.Asset("Afterlight Lantern Market Kit", "container", {
    url: lanternMarketUrl,
    filename: "afterlight_lantern_market_kit.runtime.draco.glb",
  });
  let instance: pc.Entity | null = null;
  let assembly: pc.Entity | null = null;

  try {
    await loadAsset(app, asset);
    const container = asset.resource as pc.ContainerResource | null;
    if (!container) throw new Error("Lantern Market container has no resource");
    instance = container.instantiateRenderEntity();

    const moduleSources = new Map<string, pc.Entity>();
    for (const name of Object.keys(MARKET_MODULE_LAYOUT)) {
      const entity = instance.findByName(name) as pc.Entity | null;
      if (!entity) {
        throw new Error(
          `Lantern Market module '${name}' was not found in the GLB`,
        );
      }
      moduleSources.set(name, entity);
    }

    assembly = new pc.Entity("Lantern Market Authored v01");
    assembly.enabled = false;
    assembly.tags.add("authored:market");
    assembly.setLocalPosition(0, 0.16, 3.5);

    for (const [name, transform] of Object.entries(MARKET_MODULE_LAYOUT)) {
      const entity = moduleSources.get(name)!;
      entity.reparent(assembly);
      entity.enabled = true;
      entity.setLocalPosition(...transform.position);
      entity.setLocalEulerAngles(...transform.rotation);
      entity.setLocalScale(...transform.scale);
    }

    tuneMarketMaterials(assembly);
    tagMarketMarkers(assembly);
    addMarketPocketLights(assembly);

    instance.destroy();
    instance = null;
    app.root.addChild(assembly);
    assembly.enabled = true;

    fallback.forEach((entity) => entity.destroy());
    fallbackLight.destroy();
    return assembly;
  } catch (error) {
    assembly?.destroy();
    instance?.destroy();
    asset.unload();
    app.assets.remove(asset);
    throw error;
  }
}

const GARDEN_MODULE_LAYOUT: Record<string, AuthoredModuleLayout> = {
  RG_TerraceWaterEdge_A: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_ResonanceLoom_A: {
    position: [0, 0.26, -0.3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_SoundBowlPlanter_A: {
    position: [-4.4, 0.26, 1.42],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_DuetBench_A: {
    position: [4.18, 0.26, -1.18],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_ListeningDais_A: {
    position: [-4.28, 0.26, -1.82],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_OverlookRail_A: {
    position: [3.68, 0.26, -3.14],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_GardenScreen_A: {
    position: [4.65, 0.26, 1.66],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  RG_LanternReeds_A: {
    position: [5.62, 0.16, 4.36],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
};

const GARDEN_REQUIRED_MATERIALS = [
  "MAT_AFT_WetNightStone",
  "MAT_AFT_BlueBlackStone",
  "MAT_AFT_TidalWater",
  "MAT_AFT_PearlLimewash",
  "MAT_AFT_AgedBronze",
  "MAT_AFT_GlazedSeaCeramic",
  "MAT_AFT_SmokedSeaGlass",
  "MAT_AFT_CanvasClay",
  "MAT_AFT_PlanterSoil",
  "MAT_AFT_GardenLeafDark",
  "MAT_AFT_GardenLeafMint",
  "MAT_AFT_WarmMarketWood",
  "MAT_AFT_LanternWarm",
];

function tuneGardenMaterials(root: pc.Entity) {
  const materials = new Map<string, pc.StandardMaterial>();
  const renderComponents = root.findComponents(
    "render",
  ) as pc.RenderComponent[];
  renderComponents.forEach((component) => {
    component.meshInstances.forEach((meshInstance) => {
      if (meshInstance.material instanceof pc.StandardMaterial) {
        materials.set(meshInstance.material.name, meshInstance.material);
      }
    });
  });

  const missing = GARDEN_REQUIRED_MATERIALS.filter(
    (name) => !materials.has(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Resonance Garden materials were not found in the GLB: ${missing.join(", ")}`,
    );
  }

  materials.forEach((material, name) => {
    material.opacity = 1;
    material.blendType = pc.BLEND_NONE;
    material.depthWrite = true;
    material.metalness = 0;
    material.emissive.set(0, 0, 0);
    material.emissiveIntensity = 1;

    switch (name) {
      case "MAT_AFT_WetNightStone":
        material.diffuse.copy(palette.stone);
        material.gloss = 0.86;
        material.metalness = 0.07;
        break;
      case "MAT_AFT_BlueBlackStone":
        material.diffuse.set(0.045, 0.105, 0.14);
        material.gloss = 0.6;
        break;
      case "MAT_AFT_TidalWater":
        material.diffuse.copy(palette.water);
        material.gloss = 0.96;
        material.metalness = 0.08;
        material.emissive.set(0.006, 0.028, 0.04);
        material.emissiveIntensity = 0.62;
        material.opacity = 0.84;
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        break;
      case "MAT_AFT_PearlLimewash":
        material.diffuse.copy(palette.pearl);
        material.gloss = 0.25;
        break;
      case "MAT_AFT_AgedBronze":
        material.diffuse.copy(palette.bronze);
        material.gloss = 0.68;
        material.metalness = 0.78;
        break;
      case "MAT_AFT_GlazedSeaCeramic":
        material.diffuse.set(0.08, 0.38, 0.4);
        material.gloss = 0.84;
        material.metalness = 0.04;
        break;
      case "MAT_AFT_SmokedSeaGlass":
        material.diffuse.copy(palette.glass);
        material.gloss = 0.92;
        material.opacity = 0.32;
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        break;
      case "MAT_AFT_CanvasClay":
        material.diffuse.copy(palette.coral);
        material.gloss = 0.22;
        break;
      case "MAT_AFT_PlanterSoil":
        material.diffuse.set(0.06, 0.04, 0.03);
        material.gloss = 0.12;
        break;
      case "MAT_AFT_GardenLeafDark":
        material.diffuse.copy(palette.foliage);
        material.gloss = 0.25;
        break;
      case "MAT_AFT_GardenLeafMint":
        material.diffuse.set(0.18, 0.48, 0.41);
        material.gloss = 0.3;
        break;
      case "MAT_AFT_WarmMarketWood":
        material.diffuse.set(0.22, 0.105, 0.065);
        material.gloss = 0.42;
        break;
      case "MAT_AFT_LanternWarm":
        material.diffuse.set(0.84, 0.37, 0.12);
        material.gloss = 0.62;
        material.emissive.set(1, 0.24, 0.045);
        material.emissiveIntensity = 1.5;
        break;
      default:
        break;
    }
    material.update();
  });
}

const GARDEN_MARKER_TAGS: Array<[string, string]> = [
  ["COL_", "garden:collision"],
  ["INT_", "garden:interaction"],
  ["NAV_", "garden:nav"],
  ["SOC_", "garden:social-volume"],
  ["ACT_", "garden:activity-volume"],
  ["SFX_", "garden:audio-anchor"],
  ["VFX_", "garden:vfx-anchor"],
  ["LGT_", "garden:light-anchor"],
  ["VOL_", "garden:volume"],
];

function tagGardenMarkers(root: pc.Entity) {
  const visit = (entity: pc.Entity) => {
    const marker = GARDEN_MARKER_TAGS.find(([prefix]) =>
      entity.name.startsWith(prefix),
    );
    if (marker) entity.tags.add(marker[1]);
    (entity.children as pc.Entity[]).forEach(visit);
  };
  visit(root);
}

function addGardenPocketLights(parent: pc.Entity) {
  const lights: Array<{
    name: string;
    position: [number, number, number];
    color: pc.Color;
    intensity: number;
    range: number;
  }> = [
    {
      name: "Resonance loom glow",
      position: [0, 2.45, -0.3],
      color: new pc.Color(0.18, 0.62, 0.66),
      intensity: 0.7,
      range: 5.6,
    },
    {
      name: "Garden duet warmth",
      position: [4.18, 2.05, -1.18],
      color: new pc.Color(1, 0.38, 0.15),
      intensity: 0.6,
      range: 4.8,
    },
    {
      name: "Listening dais warmth",
      position: [-4.28, 2.05, -1.82],
      color: new pc.Color(0.92, 0.31, 0.2),
      intensity: 0.48,
      range: 4.6,
    },
    {
      name: "Garden reed lanterns",
      position: [5.62, 2.15, 4.36],
      color: new pc.Color(1, 0.4, 0.14),
      intensity: 0.64,
      range: 4.5,
    },
  ];

  lights.forEach((spec) => {
    const light = new pc.Entity(spec.name);
    light.addComponent("light", {
      type: "omni",
      color: spec.color,
      intensity: spec.intensity,
      range: spec.range,
      castShadows: false,
    });
    parent.addChild(light);
    light.setLocalPosition(...spec.position);
  });
}

async function installAuthoredGarden(
  app: pc.Application,
  fallback: pc.Entity[],
) {
  const asset = new pc.Asset("Afterlight Resonance Garden Kit", "container", {
    url: resonanceGardenUrl,
    filename: "afterlight_resonance_garden_kit.runtime.draco.glb",
  });
  let instance: pc.Entity | null = null;
  let assembly: pc.Entity | null = null;

  try {
    await loadAsset(app, asset);
    const container = asset.resource as pc.ContainerResource | null;
    if (!container)
      throw new Error("Resonance Garden container has no resource");
    instance = container.instantiateRenderEntity();

    const moduleSources = new Map<string, pc.Entity>();
    for (const name of Object.keys(GARDEN_MODULE_LAYOUT)) {
      const entity = instance.findByName(name) as pc.Entity | null;
      if (!entity) {
        throw new Error(
          `Resonance Garden module '${name}' was not found in the GLB`,
        );
      }
      moduleSources.set(name, entity);
    }

    assembly = new pc.Entity("Resonance Garden Authored v01");
    assembly.enabled = false;
    assembly.tags.add("authored:garden");
    assembly.setLocalPosition(0, 0, -14);

    for (const [name, transform] of Object.entries(GARDEN_MODULE_LAYOUT)) {
      const entity = moduleSources.get(name)!;
      entity.reparent(assembly);
      entity.enabled = true;
      entity.setLocalPosition(...transform.position);
      entity.setLocalEulerAngles(...transform.rotation);
      entity.setLocalScale(...transform.scale);
    }

    tuneGardenMaterials(assembly);
    tagGardenMarkers(assembly);
    addGardenPocketLights(assembly);

    instance.destroy();
    instance = null;
    app.root.addChild(assembly);
    assembly.enabled = true;

    fallback.forEach((entity) => entity.destroy());
    return assembly;
  } catch (error) {
    assembly?.destroy();
    instance?.destroy();
    asset.unload();
    app.assets.remove(asset);
    throw error;
  }
}

async function installEnvironment(app: pc.Application) {
  const asset = new pc.Asset(
    "Belfast Sunset Pure Sky",
    "texture",
    { url: belfastSkyUrl, filename: "belfast_sunset_puresky_1k.hdr" },
    { mipmaps: false },
  );
  await loadAsset(app, asset);
  const source = asset.resource as pc.Texture;
  const lightingSource = pc.EnvLighting.generateLightingSource(source, {
    size: 32,
  });
  app.scene.envAtlas = pc.EnvLighting.generateAtlas(lightingSource, {
    size: 128,
    numReflectionSamples: 32,
    numAmbientSamples: 64,
  });
  app.scene.skybox = pc.EnvLighting.generateSkyboxCubemap(source, 256);
  app.scene.skyboxIntensity = 0.18;
}

type AvatarMaterialName =
  | "MAT_AV_Skin_WarmUmber"
  | "MAT_AV_Hair_BlueBlack"
  | "MAT_AV_Face_DeepInk"
  | "MAT_AV_Inner_SeaGlass"
  | "MAT_AV_Coat_Pearl"
  | "MAT_AV_Scarf_Coral"
  | "MAT_AV_Hardware_AgedBronze"
  | "MAT_AV_Trouser_DeepTide"
  | "MAT_AV_Boot_Charcoal";

const AVATAR_MATERIAL_NAMES = new Set<AvatarMaterialName>([
  "MAT_AV_Skin_WarmUmber",
  "MAT_AV_Hair_BlueBlack",
  "MAT_AV_Face_DeepInk",
  "MAT_AV_Inner_SeaGlass",
  "MAT_AV_Coat_Pearl",
  "MAT_AV_Scarf_Coral",
  "MAT_AV_Hardware_AgedBronze",
  "MAT_AV_Trouser_DeepTide",
  "MAT_AV_Boot_Charcoal",
]);

const AVATAR_SKIN_COLORS: Record<AvatarAppearance["skinTone"], string> = {
  "deep-umber": "#5b2f24",
  "rich-sienna": "#81503b",
  "warm-ochre": "#ad7657",
  "golden-sand": "#d2a17a",
  "light-almond": "#ebc6a7",
};

const AVATAR_HAIR_COLORS: Record<AvatarAppearance["hairColor"], string> = {
  "blue-black": "#13272d",
  espresso: "#38241f",
  chestnut: "#71442f",
  copper: "#a65d3f",
};

const AVATAR_OUTFIT_COLORS: Record<
  AvatarAppearance["outfit"]["palette"],
  { coat: string; inner: string; trouser: string; boot: string }
> = {
  "pearl-tide": {
    coat: "#aebabb",
    inner: "#298c8f",
    trouser: "#0e2530",
    boot: "#071116",
  },
  "coral-dusk": {
    coat: "#c99082",
    inner: "#7e3f50",
    trouser: "#241d2e",
    boot: "#100d16",
  },
  "garden-glass": {
    coat: "#9ab9a8",
    inner: "#236c62",
    trouser: "#112c2b",
    boot: "#091a19",
  },
};

const AVATAR_FRAME_SCALES: Record<
  AvatarAppearance["frame"],
  [number, number, number]
> = {
  narrow: [0.94, 1, 0.98],
  balanced: [1, 1, 1],
  broad: [1.06, 1, 1.03],
};

const AVATAR_BRONZE_COLOR = "#6f4b2d";
const AVATAR_FACE_COLOR = "#080b0d";
const AVATAR_SUNTHREAD_COLOR = "#f4c66d";
const AVATAR_RAINLIGHT_TEAL_COLOR = "#6bd7c7";
const AVATAR_RAINLIGHT_ROSE_COLOR = "#ec8faa";

function copyAvatarAppearance(value: AvatarAppearance): AvatarAppearance {
  return { ...value, outfit: { ...value.outfit } };
}

function avatarAppearanceKey(value: AvatarAppearance) {
  return [
    value.v,
    value.frame,
    value.skinTone,
    value.hairStyle,
    value.hairColor,
    value.outfit.base,
    value.outfit.palette,
    value.outfit.trim,
    value.accessory,
  ].join(":");
}

function colorFromHex(value: string) {
  return new pc.Color().fromString(value);
}

function paintAvatarMaterial(
  material: pc.StandardMaterial | undefined,
  color: pc.Color,
  emissiveScale = 0,
) {
  if (!material) return;
  material.diffuse.copy(color);
  material.emissive.copy(color).mulScalar(emissiveScale);
  material.update();
}

type Avatar = {
  root: pc.Entity;
  material: pc.StandardMaterial;
  auraMaterial: pc.StandardMaterial;
  fallbackSkinMaterial: pc.StandardMaterial;
  fallbackHairMaterial: pc.StandardMaterial;
  fallbackShoeMaterial: pc.StandardMaterial;
  targetPosition: pc.Vec3;
  targetHeading: number;
  lastPosition: pc.Vec3;
  motionBlend: number;
  animationClock: number;
  animationPhase: number;
  pose: "listening" | null;
  fallbackVisual: pc.Entity;
  authoredVisual: pc.Entity | null;
  authoredClip: string | null;
  authoredClips: Set<string>;
  authoredMaterials: Map<AvatarMaterialName, pc.StandardMaterial>;
  authoredScarf: pc.Entity | null;
  authoredHardware: pc.Entity | null;
  lanternkeeperCharm: pc.Entity;
  appearance: AvatarAppearance;
  appearanceKey: string;
  parts: {
    torso: pc.Entity;
    hips: pc.Entity;
    headRig: pc.Entity;
    armL: pc.Entity;
    armR: pc.Entity;
    legL: pc.Entity;
    legR: pc.Entity;
  };
  color: string;
};

function avatarRootHeight(z: number) {
  if (z >= 29.45) return 0.05;
  if (z >= 28.05) return 0.12;
  if (z >= 26.35) return 0.19;
  return 0.21;
}

function avatar(
  app: pc.Application,
  name: string,
  material: pc.StandardMaterial,
  position: [number, number, number],
): Avatar {
  const seed = Array.from(name).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    17,
  );
  const skinTones = [
    new pc.Color(0.32, 0.17, 0.11),
    new pc.Color(0.49, 0.28, 0.18),
    new pc.Color(0.68, 0.43, 0.29),
    new pc.Color(0.82, 0.61, 0.45),
    new pc.Color(0.91, 0.75, 0.61),
  ];
  const skin = makeMaterial(
    `${name} skin`,
    skinTones[seed % skinTones.length],
    { gloss: 0.3 },
  );
  const hair = makeMaterial(
    `${name} hair`,
    seed % 3 === 0
      ? new pc.Color(0.16, 0.08, 0.045)
      : seed % 3 === 1
        ? new pc.Color(0.035, 0.055, 0.06)
        : new pc.Color(0.31, 0.18, 0.08),
    { gloss: 0.2 },
  );
  const shoes = makeMaterial(
    `${name} shoes`,
    new pc.Color(0.035, 0.07, 0.085),
    { gloss: 0.42 },
  );
  const auraMaterial = material.clone();
  auraMaterial.name = `${name} aura`;
  auraMaterial.emissive.copy(material.diffuse).mulScalar(0.42);
  auraMaterial.emissiveIntensity = 1;
  auraMaterial.update();
  const root = new pc.Entity(name);
  app.root.addChild(root);
  root.setPosition(...position);
  const fallbackVisual = new pc.Entity(`${name} fallback visual`);
  root.addChild(fallbackVisual);
  const torso = primitive(
    app,
    `${name} torso`,
    "capsule",
    material,
    [0, 1.08, 0],
    [0.34, 0.48, 0.25],
    undefined,
    fallbackVisual,
  );
  const hips = primitive(
    app,
    `${name} hips`,
    "sphere",
    material,
    [0, 0.72, 0],
    [0.28, 0.21, 0.24],
    undefined,
    fallbackVisual,
  );

  const headRig = new pc.Entity(`${name} head rig`);
  fallbackVisual.addChild(headRig);
  headRig.setLocalPosition(0, 1.55, 0);
  primitive(
    app,
    `${name} neck`,
    "cylinder",
    skin,
    [0, -0.04, 0],
    [0.105, 0.12, 0.105],
    undefined,
    headRig,
  );
  primitive(
    app,
    `${name} head`,
    "sphere",
    skin,
    [0, 0.18, 0],
    [0.245, 0.27, 0.245],
    undefined,
    headRig,
  );
  primitive(
    app,
    `${name} hair`,
    "sphere",
    hair,
    [0, 0.31, 0.025],
    [0.255, 0.16, 0.25],
    undefined,
    headRig,
  );

  const makeJoint = (
    jointName: string,
    jointPosition: [number, number, number],
  ) => {
    const joint = new pc.Entity(`${name} ${jointName} rig`);
    fallbackVisual.addChild(joint);
    joint.setLocalPosition(...jointPosition);
    return joint;
  };

  const legL = makeJoint("leg L", [-0.12, 0.7, 0]);
  const legR = makeJoint("leg R", [0.12, 0.7, 0]);
  primitive(
    app,
    `${name} leg L`,
    "capsule",
    material,
    [0, -0.28, 0],
    [0.115, 0.34, 0.115],
    undefined,
    legL,
  );
  primitive(
    app,
    `${name} shoe L`,
    "box",
    shoes,
    [0, -0.62, -0.08],
    [0.2, 0.12, 0.34],
    undefined,
    legL,
  );
  primitive(
    app,
    `${name} leg R`,
    "capsule",
    material,
    [0, -0.28, 0],
    [0.115, 0.34, 0.115],
    undefined,
    legR,
  );
  primitive(
    app,
    `${name} shoe R`,
    "box",
    shoes,
    [0, -0.62, -0.08],
    [0.2, 0.12, 0.34],
    undefined,
    legR,
  );

  const armL = makeJoint("arm L", [-0.3, 1.34, 0]);
  const armR = makeJoint("arm R", [0.3, 1.34, 0]);
  primitive(
    app,
    `${name} arm L`,
    "capsule",
    material,
    [0, -0.29, 0],
    [0.09, 0.35, 0.09],
    undefined,
    armL,
  );
  primitive(
    app,
    `${name} hand L`,
    "sphere",
    skin,
    [0, -0.61, 0],
    [0.105, 0.12, 0.095],
    undefined,
    armL,
  );
  primitive(
    app,
    `${name} arm R`,
    "capsule",
    material,
    [0, -0.29, 0],
    [0.09, 0.35, 0.09],
    undefined,
    armR,
  );
  primitive(
    app,
    `${name} hand R`,
    "sphere",
    skin,
    [0, -0.61, 0],
    [0.105, 0.12, 0.095],
    undefined,
    armR,
  );
  primitive(
    app,
    `${name} signal`,
    "sphere",
    auraMaterial,
    [0, 1.18, -0.24],
    [0.075, 0.075, 0.045],
    undefined,
    // The small public aura remains present when the authored GLB replaces
    // the fallback, so outfit rewards never erase a player's identity color.
    root,
  );
  const charmBronze = makeMaterial(
    `${name} Lanternkeeper charm bronze`,
    new pc.Color(0.48, 0.31, 0.14),
    { metalness: 0.42, gloss: 0.62 },
  );
  const charmLight = makeMaterial(
    `${name} Lanternkeeper charm light`,
    new pc.Color(1, 0.58, 0.2),
    {
      emissive: new pc.Color(1, 0.34, 0.07),
      gloss: 0.72,
      opacity: 0.94,
    },
  );
  const lanternkeeperCharm = new pc.Entity(`${name} Lanternkeeper charm`);
  root.addChild(lanternkeeperCharm);
  lanternkeeperCharm.setLocalPosition(-0.36, 0.86, 0.04);
  primitive(
    app,
    `${name} Lanternkeeper charm loop`,
    "cylinder",
    charmBronze,
    [0, 0.09, 0],
    [0.018, 0.1, 0.018],
    undefined,
    lanternkeeperCharm,
  );
  primitive(
    app,
    `${name} Lanternkeeper charm frame`,
    "box",
    charmBronze,
    [0, -0.035, 0],
    [0.085, 0.105, 0.065],
    undefined,
    lanternkeeperCharm,
  );
  primitive(
    app,
    `${name} Lanternkeeper charm glow`,
    "sphere",
    charmLight,
    [0, -0.035, -0.068],
    [0.055, 0.07, 0.035],
    undefined,
    lanternkeeperCharm,
  );
  lanternkeeperCharm.enabled = false;
  const entry: Avatar = {
    root,
    material,
    auraMaterial,
    fallbackSkinMaterial: skin,
    fallbackHairMaterial: hair,
    fallbackShoeMaterial: shoes,
    targetPosition: root.getPosition().clone(),
    targetHeading: 0,
    lastPosition: root.getPosition().clone(),
    motionBlend: 0,
    animationClock: 0,
    animationPhase: (seed % 628) / 100,
    pose: null,
    fallbackVisual,
    authoredVisual: null,
    authoredClip: null,
    authoredClips: new Set<string>(),
    authoredMaterials: new Map<AvatarMaterialName, pc.StandardMaterial>(),
    authoredScarf: null,
    authoredHardware: null,
    lanternkeeperCharm,
    appearance: copyAvatarAppearance(DEFAULT_AVATAR_APPEARANCE),
    appearanceKey: "",
    parts: { torso, hips, headRig, armL, armR, legL, legR },
    color: "#d97967",
  };
  applyAvatarAppearance(
    entry,
    entry.color,
    DEFAULT_AVATAR_APPEARANCE,
    true,
  );
  return entry;
}

function applyAvatarAppearance(
  entry: Avatar,
  color: string,
  appearance: AvatarAppearance,
  force = false,
) {
  const nextKey = avatarAppearanceKey(appearance);
  if (!force && entry.color === color && entry.appearanceKey === nextKey)
    return;

  entry.color = color;
  entry.appearance = copyAvatarAppearance(appearance);
  entry.appearanceKey = nextKey;

  const auraColor = colorFromHex(color);
  const skinColor = colorFromHex(AVATAR_SKIN_COLORS[appearance.skinTone]);
  const hairColor = colorFromHex(AVATAR_HAIR_COLORS[appearance.hairColor]);
  const outfit = AVATAR_OUTFIT_COLORS[appearance.outfit.palette];
  const coatColor = colorFromHex(outfit.coat);
  const innerColor = colorFromHex(outfit.inner);
  const trouserColor = colorFromHex(outfit.trouser);
  const bootColor = colorFromHex(outfit.boot);
  const bronzeColor = colorFromHex(AVATAR_BRONZE_COLOR);
  const faceColor = colorFromHex(AVATAR_FACE_COLOR);
  const trimColor =
    appearance.outfit.trim === "sunthread"
      ? colorFromHex(AVATAR_SUNTHREAD_COLOR)
      : appearance.outfit.trim === "rainlight"
        ? colorFromHex(AVATAR_RAINLIGHT_ROSE_COLOR)
        : auraColor;
  const [frameX, frameY, frameZ] = AVATAR_FRAME_SCALES[appearance.frame];

  entry.fallbackVisual.setLocalScale(frameX, frameY, frameZ);
  entry.authoredVisual?.setLocalScale(frameX, frameY, frameZ);

  // The low-cost fallback has no swappable clothing geometry, but it keeps
  // the selected silhouette and the most legible material distinctions.
  paintAvatarMaterial(entry.material, coatColor);
  paintAvatarMaterial(entry.fallbackSkinMaterial, skinColor);
  paintAvatarMaterial(entry.fallbackHairMaterial, hairColor);
  paintAvatarMaterial(entry.fallbackShoeMaterial, bootColor);
  paintAvatarMaterial(entry.auraMaterial, auraColor, 0.42);

  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Skin_WarmUmber"),
    skinColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Hair_BlueBlack"),
    hairColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Face_DeepInk"),
    faceColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Coat_Pearl"),
    coatColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Inner_SeaGlass"),
    innerColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Trouser_DeepTide"),
    trouserColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Boot_Charcoal"),
    bootColor,
  );
  paintAvatarMaterial(
    entry.authoredMaterials.get("MAT_AV_Hardware_AgedBronze"),
    bronzeColor,
  );
  const scarfMaterial = entry.authoredMaterials.get("MAT_AV_Scarf_Coral");
  if (appearance.outfit.trim === "rainlight" && scarfMaterial) {
    const rainlightTeal = colorFromHex(AVATAR_RAINLIGHT_TEAL_COLOR);
    scarfMaterial.diffuse.copy(trimColor);
    scarfMaterial.emissive.copy(rainlightTeal).mulScalar(0.34);
    scarfMaterial.emissiveIntensity = 1.35;
    scarfMaterial.gloss = 0.46;
    scarfMaterial.update();
  } else {
    paintAvatarMaterial(
      scarfMaterial,
      trimColor,
      appearance.outfit.trim === "sunthread" ? 0.12 : 0.08,
    );
    if (scarfMaterial) {
      scarfMaterial.emissiveIntensity = 1;
      scarfMaterial.gloss = 0.34;
      scarfMaterial.update();
    }
  }

  if (entry.authoredScarf) {
    entry.authoredScarf.enabled = appearance.outfit.trim !== "minimal";
  }
  if (entry.authoredHardware) {
    entry.authoredHardware.enabled =
      appearance.accessory === "aged-bronze-fittings";
  }
  entry.lanternkeeperCharm.enabled =
    appearance.accessory === "lanternkeeper-charm";

  if (entry.root.name === "Local player") {
    document.documentElement.dataset.avatarFrame = appearance.frame;
    document.documentElement.dataset.avatarPalette = appearance.outfit.palette;
    document.documentElement.dataset.avatarTrim = appearance.outfit.trim;
    document.documentElement.dataset.avatarAccessory = appearance.accessory;
  }
}

function tuneAuthoredAvatarMaterials(entry: Avatar, visual: pc.Entity) {
  entry.authoredMaterials.clear();
  entry.authoredScarf = null;
  entry.authoredHardware = null;
  const clones = new Map<pc.Material, pc.StandardMaterial>();
  const components = visual.findComponents("render") as pc.RenderComponent[];
  components.forEach((component) => {
    component.castShadows = true;
    component.receiveShadows = true;
    component.meshInstances.forEach((meshInstance) => {
      const source = meshInstance.material;
      if (!(source instanceof pc.StandardMaterial)) return;
      let material = clones.get(source);
      if (!material) {
        material = source.clone();
        material.name = source.name;
        material.opacity = 1;
        material.blendType = pc.BLEND_NONE;
        material.depthWrite = true;
        material.metalness = 0;
        material.emissive.set(0, 0, 0);
        material.emissiveIntensity = 1;

        switch (material.name) {
          case "MAT_AV_Coat_Pearl":
            material.diffuse.copy(palette.pearl);
            material.gloss = 0.3;
            break;
          case "MAT_AV_Inner_SeaGlass":
            material.diffuse.set(0.16, 0.55, 0.56);
            material.gloss = 0.62;
            break;
          case "MAT_AV_Scarf_Coral":
            material.diffuse.copy(entry.material.diffuse);
            material.emissive.copy(entry.material.diffuse).mulScalar(0.08);
            material.emissiveIntensity = 0.45;
            material.gloss = 0.34;
            break;
          case "MAT_AV_Trouser_DeepTide":
            material.diffuse.set(0.055, 0.105, 0.13);
            material.gloss = 0.28;
            break;
          case "MAT_AV_Boot_Charcoal":
            material.diffuse.set(0.025, 0.045, 0.052);
            material.gloss = 0.56;
            break;
          case "MAT_AV_Hair_BlueBlack":
            material.diffuse.set(0.035, 0.075, 0.085);
            material.gloss = 0.38;
            break;
          case "MAT_AV_Hardware_AgedBronze":
            material.diffuse.copy(palette.bronze);
            material.metalness = 0.72;
            material.gloss = 0.66;
            break;
          case "MAT_AV_Face_DeepInk":
            material.diffuse.set(0.025, 0.035, 0.04);
            material.gloss = 0.22;
            break;
          case "MAT_AV_Skin_WarmUmber":
            material.gloss = 0.3;
            break;
          default:
            break;
        }
        material.update();
        if (AVATAR_MATERIAL_NAMES.has(material.name as AvatarMaterialName)) {
          entry.authoredMaterials.set(
            material.name as AvatarMaterialName,
            material,
          );
        }
        clones.set(source, material);
      }
      meshInstance.material = material;
    });
  });
  entry.authoredScarf = visual.findByName("AV_Mesh_Scarf") as pc.Entity | null;
  entry.authoredHardware = visual.findByName(
    "AV_Mesh_Hardware",
  ) as pc.Entity | null;
}

function transitionAuthoredAvatar(entry: Avatar, clip: string, duration = 0.2) {
  const anim = entry.authoredVisual?.anim;
  if (!anim || !entry.authoredClips.has(clip) || entry.authoredClip === clip)
    return;
  const layer = anim.baseLayer;
  if (!layer) return;
  if (entry.authoredClip) layer.transition(clip, duration);
  else layer.play(clip);
  entry.authoredClip = clip;
  if (entry.root.name === "Local player") {
    document.documentElement.dataset.avatarClip = clip;
  }
}

type AuthoredAvatarContainer = pc.ContainerResource & {
  animations: pc.Asset[];
};

function attachAuthoredAvatar(
  entry: Avatar,
  container: AuthoredAvatarContainer,
) {
  const visual = container.instantiateRenderEntity();
  visual.name = `${entry.root.name} authored visual`;
  visual.enabled = false;
  entry.root.addChild(visual);
  visual.setLocalPosition(0, 0, 0);
  visual.setLocalEulerAngles(0, 0, 0);
  visual.setLocalScale(1, 1, 1);

  if (!visual.findByName("AV_HumanoidRig")) {
    visual.destroy();
    throw new Error("Authored avatar rig 'AV_HumanoidRig' was not found");
  }

  tuneAuthoredAvatarMaterials(entry, visual);
  visual.addComponent("anim", { activate: true });
  const anim = visual.anim;
  if (!anim) {
    visual.destroy();
    throw new Error("Authored avatar animation component was not created");
  }

  container.animations.forEach((asset) => {
    const track = asset.resource as pc.AnimTrack | null;
    if (!track?.name) return;
    entry.authoredClips.add(track.name);
    anim.assignAnimation(track.name, track, undefined, 1, true);
  });
  for (const required of ["AV_Idle_Breathe", "AV_Walk_Loop"]) {
    if (!entry.authoredClips.has(required)) {
      visual.destroy();
      entry.authoredClips.clear();
      throw new Error(`Authored avatar animation '${required}' was not found`);
    }
  }

  entry.authoredVisual = visual;
  applyAvatarAppearance(entry, entry.color, entry.appearance, true);
  entry.fallbackVisual.enabled = false;
  visual.enabled = true;
  transitionAuthoredAvatar(entry, "AV_Idle_Breathe", 0);
}

async function loadAuthoredAvatarContainer(app: pc.Application) {
  const asset = new pc.Asset("Afterlight Hero Avatar", "container", {
    url: heroAvatarUrl,
    filename: "afterlight_hero_avatar.runtime.draco.glb",
  });
  await loadAsset(app, asset);
  const container = asset.resource as AuthoredAvatarContainer | null;
  if (!container)
    throw new Error("Afterlight Hero Avatar has no container resource");
  return container;
}

function animateAvatar(entry: Avatar, dt: number) {
  const position = entry.root.getPosition();
  const planarSpeed =
    Math.hypot(
      position.x - entry.lastPosition.x,
      position.z - entry.lastPosition.z,
    ) / Math.max(dt, 1 / 240);
  const targetMotion = pc.math.clamp(planarSpeed / 3.8, 0, 1);
  entry.motionBlend = pc.math.lerp(
    entry.motionBlend,
    targetMotion,
    Math.min(1, dt * (targetMotion > entry.motionBlend ? 10 : 6)),
  );

  if (entry.authoredVisual) {
    const listeningClip = entry.authoredClips.has("AV_Listen_Seat")
      ? "AV_Listen_Seat"
      : "AV_Idle_Breathe";
    const walkingThreshold =
      entry.authoredClip === "AV_Walk_Loop" ? 0.08 : 0.18;
    const desiredClip = entry.pose
      ? listeningClip
      : entry.motionBlend > walkingThreshold
        ? "AV_Walk_Loop"
        : "AV_Idle_Breathe";
    transitionAuthoredAvatar(entry, desiredClip);
    entry.lastPosition.copy(position);
    return;
  }

  if (entry.pose === "listening") {
    entry.motionBlend = pc.math.lerp(
      entry.motionBlend,
      0,
      Math.min(1, dt * 10),
    );
    entry.animationClock += dt * 1.3;
    const breathe = Math.sin(entry.animationClock + entry.animationPhase);
    entry.parts.legL.setLocalEulerAngles(-68, -4, -5);
    entry.parts.legR.setLocalEulerAngles(-68, 4, 5);
    entry.parts.armL.setLocalEulerAngles(-18, 0, -12);
    entry.parts.armR.setLocalEulerAngles(-18, 0, 12);
    entry.parts.torso.setLocalPosition(0, 1.06 + breathe * 0.007, 0);
    entry.parts.hips.setLocalPosition(0, 0.7, 0);
    entry.parts.headRig.setLocalPosition(0, 1.53 + breathe * 0.005, 0);
    entry.parts.headRig.setLocalEulerAngles(1, breathe * 1.4, breathe * 0.3);
    entry.lastPosition.copy(position);
    return;
  }
  entry.animationClock += dt * (2.1 + entry.motionBlend * 5.6);

  const phase = entry.animationClock + entry.animationPhase;
  const stride = Math.sin(phase) * 28 * entry.motionBlend;
  const idleSway = Math.sin(phase * 0.42) * (1 - entry.motionBlend);
  const bob =
    Math.abs(Math.sin(phase)) * 0.024 * entry.motionBlend +
    Math.sin(phase * 0.46) * 0.006;

  entry.parts.legL.setLocalEulerAngles(stride, 0, -1.5);
  entry.parts.legR.setLocalEulerAngles(-stride, 0, 1.5);
  entry.parts.armL.setLocalEulerAngles(-stride * 0.72, 0, -5 + idleSway * 1.8);
  entry.parts.armR.setLocalEulerAngles(stride * 0.72, 0, 5 - idleSway * 1.8);
  entry.parts.torso.setLocalPosition(0, 1.08 + bob, 0);
  entry.parts.hips.setLocalPosition(0, 0.72 + bob * 0.55, 0);
  entry.parts.headRig.setLocalPosition(0, 1.55 + bob * 0.72, 0);
  entry.parts.headRig.setLocalEulerAngles(
    idleSway * 0.45,
    idleSway * 1.3,
    idleSway * 0.3,
  );
  entry.lastPosition.copy(position);
}

export type MoodStudy = {
  player: pc.Entity;
  camera: pc.Entity;
  ready: Promise<{ authoredArrival: boolean }>;
  marketReady: Promise<boolean>;
  gardenReady: Promise<boolean>;
  avatarReady: Promise<boolean>;
  environmentReady: Promise<boolean>;
  getAudioAnchorPositions: (
    name: string,
  ) => Array<{ x: number; y: number; z: number }>;
  setPlayerActivityPose: (pose: "listening" | null) => void;
  setActivityState: (activity: ActivityState | null) => void;
  setJourneyState: (journey: JourneyState) => void;
  setQuestState: (quest: QuestState | null) => void;
  setPublicEventState: (publicEvent: PublicEventState | null) => void;
  setExpeditionState: (expedition: ExpeditionState) => void;
  pickRemotePlayer: (
    screenX: number,
    screenY: number,
    radius?: number,
  ) => string | null;
  setPlayerAppearance: (
    color: string,
    appearance: AvatarAppearance,
  ) => void;
  setRemotePlayers: (
    players: Array<{
      uid: string;
      color: string;
      appearance: AvatarAppearance;
      x: number;
      z: number;
      heading?: number;
    }>,
  ) => void;
};

export function createMoodStudy(app: pc.Application): MoodStudy {
  const pearl = makeMaterial("Pearl stucco", palette.pearl, { gloss: 0.28 });
  const stone = makeMaterial("Wet blue-black stone", palette.stone, {
    gloss: 0.82,
  });
  const bronze = makeMaterial("Oxidized bronze", palette.bronze, {
    metalness: 0.8,
    gloss: 0.68,
  });
  const glass = makeMaterial("Smoked glass", palette.glass, {
    gloss: 0.92,
    opacity: 0.38,
  });
  const foliage = makeMaterial("Garden foliage", palette.foliage, {
    gloss: 0.3,
  });
  const warm = makeMaterial("Warm inhabited light", palette.warm, {
    emissive: palette.warm,
    gloss: 0.7,
  });
  const coral = makeMaterial("Canvas coral", palette.coral, { gloss: 0.42 });
  const coralGlow = makeMaterial("Interaction coral", palette.coral, {
    emissive: palette.coral.clone().mulScalar(0.45),
    gloss: 0.55,
  });
  const water = makeMaterial("Evening water", palette.water, {
    metalness: 0.08,
    gloss: 0.96,
  });

  primitive(app, "Water court", "box", water, [0, -0.48, 0], [46, 0.65, 76]);
  primitive(app, "Main terrace", "box", stone, [0, 0, 2], [17, 0.32, 54]);
  primitive(app, "Pearl promenade", "box", pearl, [0, 0.2, 2], [5.4, 0.18, 47]);
  primitive(
    app,
    "Arrival step 1",
    "box",
    stone,
    [0, 0.02, 30],
    [7.8, 0.22, 1.7],
  );
  primitive(
    app,
    "Arrival step 2",
    "box",
    pearl,
    [0, 0.09, 28.6],
    [7.35, 0.22, 1.7],
  );
  primitive(
    app,
    "Arrival step 3",
    "box",
    pearl,
    [0, 0.16, 27.2],
    [6.9, 0.22, 1.7],
  );
  const gardenFallback: pc.Entity[] = [
    primitive(
      app,
      "Garden walk",
      "box",
      stone,
      [-7.2, 0.22, -5],
      [5, 0.2, 24],
      [0, -8, 0],
    ),
  ];

  // A minimal fallback remains visible only while the original authored GLB streams in.
  const arrivalFallback = [
    primitive(
      app,
      "Conservatory left pier",
      "box",
      pearl,
      [-4.65, 2.8, 24],
      [1.7, 5.4, 2.6],
    ),
    primitive(
      app,
      "Conservatory right pier",
      "box",
      pearl,
      [4.65, 2.8, 24],
      [1.7, 5.4, 2.6],
    ),
    primitive(
      app,
      "Conservatory lintel",
      "box",
      pearl,
      [0, 5.05, 24],
      [7.7, 0.9, 2.6],
    ),
    primitive(
      app,
      "Conservatory opening",
      "box",
      glass,
      [0, 2.65, 22.55],
      [6.7, 4.45, 0.16],
    ),
  ];
  for (const x of [-4.7, -2.35, 0, 2.35, 4.7]) {
    arrivalFallback.push(
      primitive(
        app,
        "Bronze rib",
        "box",
        bronze,
        [x, 3, 22.35],
        [0.11, 5.6, 0.18],
      ),
    );
  }
  arrivalFallback.push(
    primitive(
      app,
      "Conservatory canopy",
      "box",
      bronze,
      [0, 5.4, 23.3],
      [11.5, 0.16, 4.2],
      [0, 0, -2],
    ),
  );

  // Lantern Market fallback: replaced in place when the authored kit finishes streaming.
  const marketFallback: pc.Entity[] = [];
  for (const [index, x] of [-5.3, 5.3].entries()) {
    for (const z of [7.5, 3.5, -0.5]) {
      marketFallback.push(
        primitive(
          app,
          `Market plinth ${index}`,
          "box",
          pearl,
          [x, 0.8, z],
          [3.2, 1.35, 2.25],
        ),
        primitive(
          app,
          "Canvas awning",
          "box",
          coral,
          [x, 1.85, z + 0.12],
          [3.7, 0.12, 2.8],
          [0, 0, x < 0 ? -4 : 4],
        ),
        lantern(app, x * 0.72, 2.2, z - 1.1, warm),
      );
    }
  }
  for (let z = 9; z > -3; z -= 1.7) {
    marketFallback.push(lantern(app, 0, 3.45, z, warm));
  }
  marketFallback.forEach((entity) => entity.tags.add("fallback:market"));

  // Resonance Garden: rounded planted rooms and a quiet water-edge focus.
  for (const [x, z, scale] of [
    [-7.2, -7.5, 2.6],
    [-5.6, -11.4, 1.9],
    [-8.3, -14.2, 2.3],
    [-4.6, -16.3, 1.5],
  ] as Array<[number, number, number]>) {
    gardenFallback.push(
      primitive(
        app,
        "Garden planter",
        "cylinder",
        bronze,
        [x, 0.45, z],
        [scale, 0.45, scale],
      ),
      primitive(
        app,
        "Garden canopy",
        "sphere",
        foliage,
        [x, 1.8, z],
        [scale * 0.9, 1.6, scale * 0.9],
      ),
    );
  }
  gardenFallback.push(
    primitive(
      app,
      "Resonance ring",
      "cylinder",
      coralGlow,
      [-2.8, 0.58, -14.5],
      [3.1, 0.12, 3.1],
    ),
    primitive(
      app,
      "Overlook bench",
      "box",
      pearl,
      [1.2, 0.75, -17],
      [3.4, 0.36, 0.75],
    ),
  );
  gardenFallback.forEach((entity) => entity.tags.add("fallback:garden"));

  const playerMaterial = makeMaterial(
    "Local player",
    new pc.Color(0.96, 0.54, 0.31),
    {
      emissive: new pc.Color(0.28, 0.08, 0.03),
    },
  );
  const playerAvatar = avatar(
    app,
    "Local player",
    playerMaterial,
    [0, 0.05, 30.1],
  );
  const player = playerAvatar.root;

  const camera = new pc.Entity("Camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.018, 0.055, 0.075),
    farClip: 120,
    fov: 48,
  });
  if (camera.camera) camera.camera.toneMapping = pc.TONEMAP_ACES;
  camera.setPosition(5.2, 4.4, 38.4);
  camera.lookAt(0, 1.15, 28.8);
  app.root.addChild(camera);

  const moon = new pc.Entity("Moon key");
  moon.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.47, 0.62, 0.88),
    intensity: 0.78,
    castShadows: true,
    shadowDistance: 55,
    shadowBias: 0.18,
    normalOffsetBias: 0.06,
    shadowResolution: 2048,
  });
  moon.setEulerAngles(48, -38, 0);
  app.root.addChild(moon);

  const marketGlow = new pc.Entity("Market glow");
  marketGlow.addComponent("light", {
    type: "omni",
    color: palette.warm,
    intensity: 1.65,
    range: 18,
    castShadows: false,
  });
  marketGlow.setPosition(0, 4.5, 3.5);
  app.root.addChild(marketGlow);

  // Public activity feedback lives at the shared place, not on either avatar.
  // It reflects only the consent-safe phase sent by the shell and never carries
  // partner identity, prompts, or conversation content into the renderer.
  const activityWaitingColor = new pc.Color(0.95, 0.52, 0.28);
  const activityPlayingColor = new pc.Color(0.28, 0.73, 0.68);
  const activityResolvedColor = new pc.Color(0.96, 0.78, 0.48);
  const activityWaitingMaterial = makeMaterial(
    "Activity waiting light",
    activityWaitingColor.clone(),
    {
      emissive: activityWaitingColor.clone().mulScalar(0.42),
      gloss: 0.68,
      opacity: 0.82,
    },
  );
  const activityPlayingMaterial = makeMaterial(
    "Activity playing light",
    activityPlayingColor.clone(),
    {
      emissive: activityPlayingColor.clone().mulScalar(0.58),
      gloss: 0.72,
      opacity: 0.9,
    },
  );
  const activityResolvedMaterial = makeMaterial(
    "Activity resolved light",
    activityResolvedColor.clone(),
    {
      emissive: activityResolvedColor.clone().mulScalar(0.5),
      gloss: 0.74,
      opacity: 0.88,
    },
  );

  type ActivityFeedback = {
    id: ActivityState["id"];
    root: pc.Entity;
    waiting: pc.Entity;
    playing: pc.Entity;
    resolved: pc.Entity;
    light: pc.Entity;
    x: number;
    y: number;
    z: number;
    offset: number;
  };
  const activityFeedback: ActivityFeedback[] = (
    [
      {
        id: "listening-crescent",
        x: -3.55,
        y: 0.7,
        z: 6.29,
        offset: 0,
      },
      {
        id: "resonance-duet",
        x: 0,
        y: 1.18,
        z: -14.25,
        offset: 1.7,
      },
    ] as Array<{
      id: ActivityState["id"];
      x: number;
      y: number;
      z: number;
      offset: number;
    }>
  ).map((definition) => {
    const root = new pc.Entity(`Activity phase ${definition.id}`);
    root.setPosition(definition.x, definition.y, definition.z);
    app.root.addChild(root);
    const waiting = primitive(
      app,
      `Activity waiting ${definition.id}`,
      "sphere",
      activityWaitingMaterial,
      [0, 0, 0],
      [0.13, 0.13, 0.13],
      undefined,
      root,
    );
    const playing = primitive(
      app,
      `Activity playing ${definition.id}`,
      "sphere",
      activityPlayingMaterial,
      [0, 0, 0],
      [0.17, 0.17, 0.17],
      undefined,
      root,
    );
    const resolved = primitive(
      app,
      `Activity resolved ${definition.id}`,
      "sphere",
      activityResolvedMaterial,
      [0, 0, 0],
      [0.15, 0.15, 0.15],
      undefined,
      root,
    );
    playing.enabled = false;
    resolved.enabled = false;

    const light = new pc.Entity(`Activity phase light ${definition.id}`);
    light.addComponent("light", {
      type: "omni",
      color: activityWaitingColor,
      intensity: 0,
      range: definition.id === "resonance-duet" ? 7.2 : 5.4,
      castShadows: false,
    });
    root.addChild(light);
    root.enabled = false;

    return { ...definition, root, waiting, playing, resolved, light };
  });
  let presentedActivity: ActivityState | null = null;
  let activityFeedbackClock = 0;

  const relayOutlineColor = new pc.Color(0.34, 0.72, 0.69);
  const relayInnerColor = new pc.Color(0.38, 0.84, 0.77);
  const relayFullColor = new pc.Color(0.93, 0.48, 0.62);
  const relayOutlineMaterial = makeMaterial(
    "Rainlight relay outline",
    relayOutlineColor.clone(),
    {
      emissive: relayOutlineColor.clone().mulScalar(0.16),
      gloss: 0.64,
      opacity: 0.13,
    },
  );
  const relayInnerMaterial = makeMaterial(
    "Rainlight relay inner light",
    relayInnerColor.clone(),
    {
      emissive: relayInnerColor.clone().mulScalar(0.58),
      gloss: 0.72,
      opacity: 0.88,
    },
  );
  const relayFullMaterial = makeMaterial(
    "Rainlight relay full light",
    relayFullColor.clone(),
    {
      emissive: relayInnerColor.clone().mulScalar(0.52),
      gloss: 0.76,
      opacity: 0.94,
    },
  );

  type RelayBeacon = {
    id: JourneyLandmarkId;
    root: pc.Entity;
    outline: pc.Entity;
    inner: pc.Entity;
    full: pc.Entity;
    light: pc.Entity;
    x: number;
    y: number;
    z: number;
    offset: number;
  };
  const relayBeacons: RelayBeacon[] = (
    [
      { id: "conservatory", x: 0.62, y: 1.48, z: 25.2, offset: 0 },
      { id: "market", x: 0.62, y: 1.34, z: 3.5, offset: 2.1 },
      { id: "resonance", x: -2.38, y: 1.42, z: -14.55, offset: 4.2 },
    ] as Array<{
      id: JourneyLandmarkId;
      x: number;
      y: number;
      z: number;
      offset: number;
    }>
  ).map((definition) => {
    const root = new pc.Entity(`Rainlight relay beacon ${definition.id}`);
    root.setPosition(definition.x, definition.y, definition.z);
    app.root.addChild(root);
    const outline = primitive(
      app,
      `Rainlight relay outline ${definition.id}`,
      "sphere",
      relayOutlineMaterial,
      [0, 0, 0],
      [0.43, 0.43, 0.43],
      undefined,
      root,
    );
    const inner = primitive(
      app,
      `Rainlight relay inner ${definition.id}`,
      "sphere",
      relayInnerMaterial,
      [0, 0, 0],
      [0.12, 0.12, 0.12],
      undefined,
      root,
    );
    const full = primitive(
      app,
      `Rainlight relay full ${definition.id}`,
      "sphere",
      relayFullMaterial,
      [0, 0, 0],
      [0.2, 0.2, 0.2],
      undefined,
      root,
    );
    [outline, inner, full].forEach((entity) => {
      if (!entity.render) return;
      entity.render.castShadows = false;
      entity.render.receiveShadows = false;
    });
    inner.enabled = false;
    full.enabled = false;

    const light = new pc.Entity(`Rainlight relay light ${definition.id}`);
    light.addComponent("light", {
      type: "omni",
      color: relayOutlineColor,
      intensity: 0,
      range: 3.8,
      castShadows: false,
    });
    root.addChild(light);
    root.enabled = false;
    return { ...definition, root, outline, inner, full, light };
  });
  const reducedMotionQuery = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  );
  let publicEventState: PublicEventState | null = null;
  let relayClock = 0;
  let relayCelebration = 0;

  const expeditionDormantColor = new pc.Color(0.23, 0.43, 0.46);
  const expeditionActiveColor = new pc.Color(0.34, 0.88, 0.8);
  const expeditionPartnerColor = new pc.Color(0.96, 0.5, 0.62);
  const expeditionCompleteColor = new pc.Color(0.98, 0.79, 0.43);
  const expeditionEchoColor = new pc.Color(0.7, 0.55, 1);
  const expeditionDormantMaterial = makeMaterial(
    "Lanternkeeper dormant signal",
    expeditionDormantColor.clone(),
    {
      emissive: expeditionDormantColor.clone().mulScalar(0.16),
      gloss: 0.54,
      opacity: 0.72,
    },
  );
  const expeditionActiveMaterial = makeMaterial(
    "Lanternkeeper active signal",
    expeditionActiveColor.clone(),
    {
      emissive: expeditionActiveColor.clone().mulScalar(0.62),
      gloss: 0.74,
      opacity: 0.94,
    },
  );
  const expeditionPartnerMaterial = makeMaterial(
    "Lanternkeeper partner signal",
    expeditionPartnerColor.clone(),
    {
      emissive: expeditionPartnerColor.clone().mulScalar(0.58),
      gloss: 0.72,
      opacity: 0.94,
    },
  );
  const expeditionCompleteMaterial = makeMaterial(
    "Lanternkeeper completed signal",
    expeditionCompleteColor.clone(),
    {
      emissive: expeditionCompleteColor.clone().mulScalar(0.58),
      gloss: 0.78,
      opacity: 0.96,
    },
  );
  const expeditionEchoMaterial = makeMaterial(
    "Lanternkeeper Echo signal",
    expeditionEchoColor.clone(),
    {
      emissive: expeditionEchoColor.clone().mulScalar(0.62),
      gloss: 0.74,
      opacity: 0.92,
    },
  );

  type ExpeditionTargetVisual = {
    id: ExpeditionTargetId;
    stageId: Exclude<ExpeditionStageId, "complete">;
    root: pc.Entity;
    dormant: pc.Entity;
    active: pc.Entity;
    complete: pc.Entity;
    waitingMote: pc.Entity;
    partnerMote: pc.Entity;
    echoMote: pc.Entity;
    light: pc.Entity;
    x: number;
    y: number;
    z: number;
    offset: number;
  };
  const expeditionTargets: ExpeditionTargetVisual[] = (
    [
      {
        id: "conservatory-scan",
        stageId: "conservatory-scan",
        x: 0,
        y: 0.34,
        z: 25,
        offset: 0,
      },
      {
        id: "market-west",
        stageId: "market-lanterns",
        x: -3.8,
        y: 0.36,
        z: 3.5,
        offset: 1.2,
      },
      {
        id: "market-east",
        stageId: "market-lanterns",
        x: 3.8,
        y: 0.36,
        z: 3.5,
        offset: 2.4,
      },
      {
        id: "resonance-left",
        stageId: "resonance-chime",
        x: -6.4,
        y: 0.5,
        z: -14,
        offset: 3.6,
      },
      {
        id: "resonance-right",
        stageId: "resonance-chime",
        x: -3.2,
        y: 0.5,
        z: -14,
        offset: 4.8,
      },
    ] as Array<{
      id: ExpeditionTargetId;
      stageId: Exclude<ExpeditionStageId, "complete">;
      x: number;
      y: number;
      z: number;
      offset: number;
    }>
  ).map((definition) => {
    const root = new pc.Entity(`Lanternkeeper target ${definition.id}`);
    root.setPosition(definition.x, definition.y, definition.z);
    app.root.addChild(root);

    primitive(
      app,
      `Lanternkeeper ground pad ${definition.id}`,
      "cylinder",
      expeditionDormantMaterial,
      [0, -0.24, 0],
      [0.72, 0.045, 0.72],
      undefined,
      root,
    );
    const shape = definition.id === "conservatory-scan" ? "sphere" : "capsule";
    const shapeScale: [number, number, number] =
      definition.id === "conservatory-scan"
        ? [0.23, 0.23, 0.23]
        : definition.stageId === "market-lanterns"
          ? [0.16, 0.34, 0.16]
          : [0.11, 0.42, 0.11];
    const shapeY = definition.id === "conservatory-scan" ? 0.22 : 0.34;
    const dormant = primitive(
      app,
      `Lanternkeeper dormant ${definition.id}`,
      shape,
      expeditionDormantMaterial,
      [0, shapeY, 0],
      shapeScale,
      undefined,
      root,
    );
    const active = primitive(
      app,
      `Lanternkeeper active ${definition.id}`,
      shape,
      expeditionActiveMaterial,
      [0, shapeY, 0],
      shapeScale,
      undefined,
      root,
    );
    const complete = primitive(
      app,
      `Lanternkeeper complete ${definition.id}`,
      shape,
      expeditionCompleteMaterial,
      [0, shapeY, 0],
      shapeScale,
      undefined,
      root,
    );
    active.enabled = false;
    complete.enabled = false;

    const waitingMote = primitive(
      app,
      `Lanternkeeper open partner place ${definition.id}`,
      "sphere",
      expeditionDormantMaterial,
      [0.42, 0.52, 0],
      [0.075, 0.075, 0.075],
      undefined,
      root,
    );
    const partnerMote = primitive(
      app,
      `Lanternkeeper partner present ${definition.id}`,
      "sphere",
      expeditionPartnerMaterial,
      [0.42, 0.52, 0],
      [0.09, 0.09, 0.09],
      undefined,
      root,
    );
    const echoMote = primitive(
      app,
      `Lanternkeeper Echo available ${definition.id}`,
      "sphere",
      expeditionEchoMaterial,
      [0.42, 0.52, 0],
      [0.1, 0.1, 0.1],
      undefined,
      root,
    );
    partnerMote.enabled = false;
    echoMote.enabled = false;

    const light = new pc.Entity(`Lanternkeeper target light ${definition.id}`);
    light.addComponent("light", {
      type: "omni",
      color: expeditionDormantColor,
      intensity: 0,
      range: 5.6,
      castShadows: false,
    });
    light.setLocalPosition(0, 0.55, 0);
    root.addChild(light);
    root.enabled = false;

    return {
      ...definition,
      root,
      dormant,
      active,
      complete,
      waitingMote,
      partnerMote,
      echoMote,
      light,
    };
  });
  let expeditionState: ExpeditionState | null = null;
  let expeditionClock = 0;
  let expeditionCelebration = 0;
  let expeditionServerOffset = 0;

  const journeyWarmColor = new pc.Color(1, 0.49, 0.24);
  const journeyVisitedColor = new pc.Color(0.26, 0.72, 0.68);
  const journeyCompleteColor = new pc.Color(0.95, 0.82, 0.56);
  const journeyWarm = makeMaterial(
    "Night journey invitation",
    journeyWarmColor.clone(),
    {
      emissive: journeyWarmColor.clone().mulScalar(0.58),
      gloss: 0.72,
      opacity: 0.9,
    },
  );
  const journeyVisitedMaterial = makeMaterial(
    "Night journey visited",
    journeyVisitedColor.clone(),
    {
      emissive: journeyVisitedColor.clone().mulScalar(0.38),
      gloss: 0.66,
      opacity: 0.82,
    },
  );
  const journeyCompleteMaterial = makeMaterial(
    "Night journey complete",
    journeyCompleteColor.clone(),
    {
      emissive: journeyCompleteColor.clone().mulScalar(0.72),
      gloss: 0.78,
      opacity: 0.94,
    },
  );
  const journeyHalo = makeMaterial(
    "Night journey halo",
    new pc.Color(0.55, 0.76, 0.78),
    {
      emissive: new pc.Color(0.18, 0.35, 0.36),
      gloss: 0.55,
      opacity: 0.12,
    },
  );

  type JourneyBeacon = {
    id: JourneyLandmarkId;
    root: pc.Entity;
    invitation: pc.Entity;
    visited: pc.Entity;
    complete: pc.Entity;
    light: pc.Entity;
    x: number;
    y: number;
    z: number;
    phase: number;
  };
  const journeyBeacons: JourneyBeacon[] = (
    [
      { id: "conservatory", x: 0, y: 1.48, z: 25.2, phase: 0 },
      { id: "market", x: 0, y: 1.34, z: 3.5, phase: 2.1 },
      { id: "resonance", x: -3, y: 1.42, z: -14.55, phase: 4.2 },
    ] as Array<{
      id: JourneyLandmarkId;
      x: number;
      y: number;
      z: number;
      phase: number;
    }>
  ).map((definition) => {
    const root = new pc.Entity(`Night journey beacon ${definition.id}`);
    root.setPosition(definition.x, definition.y, definition.z);
    app.root.addChild(root);
    const invitation = primitive(
      app,
      `Journey invitation ${definition.id}`,
      "sphere",
      journeyWarm,
      [0, 0, 0],
      [0.16, 0.16, 0.16],
      undefined,
      root,
    );
    const visited = primitive(
      app,
      `Journey visited ${definition.id}`,
      "sphere",
      journeyVisitedMaterial,
      [0, 0, 0],
      [0.13, 0.13, 0.13],
      undefined,
      root,
    );
    const complete = primitive(
      app,
      `Journey complete ${definition.id}`,
      "sphere",
      journeyCompleteMaterial,
      [0, 0, 0],
      [0.19, 0.19, 0.19],
      undefined,
      root,
    );
    primitive(
      app,
      `Journey halo ${definition.id}`,
      "sphere",
      journeyHalo,
      [0, 0, 0],
      [0.5, 0.5, 0.5],
      undefined,
      root,
    );
    visited.enabled = false;
    complete.enabled = false;

    const light = new pc.Entity(`Journey light ${definition.id}`);
    light.addComponent("light", {
      type: "omni",
      color: journeyWarmColor,
      intensity: 0.36,
      range: 3.8,
      castShadows: false,
    });
    root.addChild(light);

    return { ...definition, root, invitation, visited, complete, light };
  });
  let journeyVisited = new Set<JourneyLandmarkId>();
  let journeyComplete = false;
  let journeyClock = 0;
  let journeyCelebration = 0;
  let questState: QuestState | null = null;

  const ready = installAuthoredArrival(app, arrivalFallback)
    .then(() => true)
    .catch((error: unknown) => {
      console.warn(
        "Authored Arrival kit could not be loaded; keeping the fallback.",
        error,
      );
      return false;
    })
    .then((authoredArrival) => ({ authoredArrival }));

  // Keep the first interactive frame focused on Arrival. The market starts
  // streaming in a later task and never delays the initial READY handshake.
  const marketReady = ready.then(
    () =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => {
          void installAuthoredMarket(app, marketFallback, marketGlow).then(
            () => {
              console.info("Authored Lantern Market ready");
              resolve(true);
            },
            (error: unknown) => {
              console.warn(
                "Authored Lantern Market could not be loaded; keeping the fallback.",
                error,
              );
              resolve(false);
            },
          );
        }, 350);
      }),
  );

  const gardenReady = marketReady.then(
    () =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => {
          void installAuthoredGarden(app, gardenFallback).then(
            () => {
              console.info("Authored Resonance Garden ready");
              resolve(true);
            },
            (error: unknown) => {
              console.warn(
                "Authored Resonance Garden could not be loaded; keeping the fallback.",
                error,
              );
              resolve(false);
            },
          );
        }, 525);
      }),
  );

  // HDR convolution is useful polish, but it is substantially more expensive
  // than loading the playable geometry on some mobile GPUs. Apply it after the
  // authored route is usable and at deliberately modest runtime resolutions.
  const environmentReady = marketReady.then(
    () =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => {
          void installEnvironment(app).then(
            () => resolve(true),
            (error: unknown) => {
              console.warn(
                "HDR environment could not be loaded; keeping the procedural lighting.",
                error,
              );
              resolve(false);
            },
          );
        }, 650);
      }),
  );

  const remoteEntities = new Map<string, Avatar>();
  let authoredAvatarContainer: AuthoredAvatarContainer | null = null;
  const avatarReady = ready.then(
    () =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => {
          void loadAuthoredAvatarContainer(app).then(
            (container) => {
              try {
                attachAuthoredAvatar(playerAvatar, container);
                authoredAvatarContainer = container;
                remoteEntities.forEach((entry) => {
                  if (!entry.authoredVisual)
                    attachAuthoredAvatar(entry, container);
                });
                console.info("Authored Afterlight avatar ready");
                resolve(true);
              } catch (error) {
                console.warn(
                  "Authored Afterlight avatar could not be installed; keeping the animated fallback.",
                  error,
                );
                resolve(false);
              }
            },
            (error: unknown) => {
              console.warn(
                "Authored Afterlight avatar could not be loaded; keeping the animated fallback.",
                error,
              );
              resolve(false);
            },
          );
        }, 175);
      }),
  );
  const projectedRemote = new pc.Vec3();
  const remoteCenter = new pc.Vec3();
  const cameraToRemote = new pc.Vec3();
  app.on("update", (dt: number) => {
    activityFeedbackClock += dt;
    activityFeedback.forEach((feedback) => {
      const phase =
        presentedActivity?.id === feedback.id
          ? presentedActivity.phase
          : null;
      feedback.root.enabled = phase !== null;
      if (!phase) return;

      feedback.waiting.enabled = phase === "waiting";
      feedback.playing.enabled = phase === "playing";
      feedback.resolved.enabled = phase === "resolved";
      const rate = phase === "playing" ? 2.4 : phase === "waiting" ? 1.05 : 0.7;
      const pulse =
        (Math.sin(activityFeedbackClock * rate + feedback.offset) + 1) * 0.5;
      const scale =
        phase === "playing"
          ? 0.94 + pulse * 0.2
          : phase === "waiting"
            ? 0.9 + pulse * 0.08
            : 0.98 + pulse * 0.04;
      feedback.root.setLocalPosition(
        feedback.x,
        feedback.y + Math.sin(activityFeedbackClock * rate + feedback.offset) * 0.035,
        feedback.z,
      );
      feedback.root.setLocalScale(scale, scale, scale);

      if (feedback.light.light) {
        const color =
          phase === "playing"
            ? activityPlayingColor
            : phase === "resolved"
              ? activityResolvedColor
              : activityWaitingColor;
        const targetIntensity =
          phase === "playing"
            ? 1.05 + pulse * 0.32
            : phase === "resolved"
              ? 0.58 + pulse * 0.08
              : 0.38 + pulse * 0.12;
        feedback.light.light.color.copy(color);
        feedback.light.light.intensity = pc.math.lerp(
          feedback.light.light.intensity,
          targetIntensity,
          Math.min(1, dt * 4.5),
        );
      }
    });
    relayClock += dt;
    relayCelebration = Math.max(0, relayCelebration - dt);
    relayBeacons.forEach((beacon) => {
      const state = publicEventState;
      beacon.root.enabled = state !== null;
      if (!state) return;

      const count = state.sourceCounts[beacon.id];
      const completed = state.phase === "completed";
      const resolved = completed || state.phase === "cooldown";
      const reducedMotion = reducedMotionQuery?.matches ?? false;
      const celebrating = completed && relayCelebration > 0;
      const pulse =
        celebrating && !reducedMotion
          ? (Math.sin(relayClock * 2.2 + beacon.offset) + 1) * 0.5
          : 0;
      const scale = resolved
        ? reducedMotion
          ? 1.12
          : celebrating
            ? 1.08 + pulse * 0.18
            : 1.04
        : 1;
      const bob =
        celebrating && !reducedMotion
          ? Math.sin(relayClock * 1.7 + beacon.offset) * 0.08
          : 0;

      beacon.root.setLocalPosition(beacon.x, beacon.y + bob, beacon.z);
      beacon.root.setLocalScale(scale, scale, scale);
      beacon.outline.enabled = true;
      beacon.inner.enabled = !resolved && count === 1;
      beacon.full.enabled = resolved || count >= 2;

      if (beacon.light.light) {
        const targetIntensity = resolved
          ? 0.95 + pulse * 0.38
          : count >= 2
            ? 0.72
            : count === 1
              ? 0.36
              : 0.045;
        beacon.light.light.color.copy(
          resolved || count >= 2
            ? relayFullColor
            : count === 1
              ? relayInnerColor
              : relayOutlineColor,
        );
        beacon.light.light.intensity = pc.math.lerp(
          beacon.light.light.intensity,
          targetIntensity,
          Math.min(1, dt * 5),
        );
      }
    });
    expeditionClock += dt;
    expeditionCelebration = Math.max(0, expeditionCelebration - dt);
    const expeditionNow = Date.now() + expeditionServerOffset;
    const expeditionUrgent = Boolean(
      expeditionState?.expiresAt &&
        expeditionState.expiresAt > expeditionNow &&
        expeditionState.expiresAt - expeditionNow <= 30_000,
    );
    const expeditionReducedMotion = reducedMotionQuery?.matches ?? false;
    const expeditionPlayerPosition = player.getPosition();
    expeditionTargets.forEach((target) => {
      const state = expeditionState;
      if (!state || state.status === "idle") {
        target.root.enabled = false;
        if (target.light.light) target.light.light.intensity = 0;
        return;
      }

      const targetComplete = state.completedTargetIds.includes(target.id);
      const currentStage = state.stageId === target.stageId;
      const currentTarget =
        currentStage &&
        (state.status === "active" ||
          state.status === "forming" ||
          state.status === "expired");
      const expeditionComplete = state.status === "completed";
      const visible = targetComplete || currentTarget || expeditionComplete;
      target.root.enabled = visible;
      if (!visible) {
        if (target.light.light) target.light.light.intensity = 0;
        return;
      }

      const interactable = Boolean(
        (state.status === "active" || state.status === "forming") &&
          state.personal.joined &&
          currentStage &&
          state.personal.availableTargetIds.includes(target.id),
      );
      const near =
        interactable &&
        Math.hypot(
          expeditionPlayerPosition.x - target.x,
          expeditionPlayerPosition.z - target.z,
        ) < 2.8;
      const celebrating = expeditionComplete && expeditionCelebration > 0;
      const rate = expeditionUrgent ? 4.6 : near ? 3.2 : 1.55;
      const pulse = expeditionReducedMotion
        ? 0.5
        : (Math.sin(expeditionClock * rate + target.offset) + 1) * 0.5;
      const celebrationStrength = expeditionReducedMotion
        ? 0
        : expeditionCelebration / 5;
      const scale = celebrating
        ? expeditionReducedMotion
          ? 1.12
          : 1.08 + pulse * 0.18 + celebrationStrength * 0.25
        : near
          ? 1.06 + pulse * 0.12
          : currentTarget
            ? 0.98 + pulse * 0.055
            : 0.92;
      const bob =
        expeditionReducedMotion || (!near && !celebrating)
          ? 0
          : Math.sin(expeditionClock * 2.15 + target.offset) *
            (celebrating ? 0.1 : 0.045);
      target.root.setLocalPosition(target.x, target.y + bob, target.z);
      target.root.setLocalScale(scale, scale, scale);

      target.dormant.enabled = !targetComplete && !interactable;
      target.active.enabled = interactable && !targetComplete;
      target.complete.enabled = targetComplete || expeditionComplete;
      const showsCooperation = interactable && !targetComplete;
      const echoAvailable = showsCooperation && state.personal.canUseEcho;
      const partnerPresent = showsCooperation && state.memberCount > 1;
      target.waitingMote.enabled =
        showsCooperation && !partnerPresent && !echoAvailable;
      target.partnerMote.enabled = partnerPresent && !echoAvailable;
      target.echoMote.enabled =
        echoAvailable || (expeditionComplete && state.resultMode === "echo");

      const orbitAngle = expeditionReducedMotion
        ? target.offset
        : expeditionClock * (echoAvailable ? 2.1 : 1.35) + target.offset;
      const orbitX = Math.cos(orbitAngle) * 0.42;
      const orbitZ = Math.sin(orbitAngle) * 0.42;
      const orbitY = 0.5 + (expeditionReducedMotion ? 0 : pulse * 0.08);
      [target.waitingMote, target.partnerMote, target.echoMote].forEach(
        (mote) => mote.setLocalPosition(orbitX, orbitY, orbitZ),
      );

      if (target.light.light) {
        const lightColor =
          targetComplete || expeditionComplete
            ? expeditionCompleteColor
            : echoAvailable
              ? expeditionEchoColor
              : partnerPresent
                ? expeditionPartnerColor
                : interactable
                  ? expeditionActiveColor
                  : expeditionDormantColor;
        const targetIntensity =
          targetComplete || expeditionComplete
            ? 0.86 + pulse * 0.28 + celebrationStrength * 0.7
            : near
              ? 0.9 + pulse * 0.4
              : interactable
                ? 0.42 + pulse * 0.16
                : 0.12;
        target.light.light.color.copy(lightColor);
        target.light.light.intensity = pc.math.lerp(
          target.light.light.intensity,
          targetIntensity,
          Math.min(1, dt * 5.5),
        );
      }
    });
    journeyClock += dt;
    journeyCelebration = Math.max(0, journeyCelebration - dt);
    journeyBeacons.forEach((beacon) => {
      const wasVisited = journeyVisited.has(beacon.id);
      const isQuestTarget = questState?.targetLandmarkId === beacon.id;
      const questReady =
        isQuestTarget && questState?.status === "ready-to-turn-in";
      const pulse = (Math.sin(journeyClock * 1.45 + beacon.phase) + 1) * 0.5;
      const celebrationStrength = journeyCelebration / 4;
      const journeyScale = journeyComplete
        ? 0.95 + pulse * 0.12 + celebrationStrength * 0.38
        : wasVisited
          ? 0.72 + pulse * 0.025
          : 0.86 + pulse * 0.08;
      const scale = journeyScale + (isQuestTarget ? 0.18 + pulse * 0.14 : 0);
      beacon.root.setLocalPosition(
        beacon.x,
        beacon.y +
          Math.sin(journeyClock * 1.1 + beacon.phase) *
            (isQuestTarget ? 0.11 : 0.07),
        beacon.z,
      );
      beacon.root.setLocalScale(scale, scale, scale);
      beacon.invitation.enabled = isQuestTarget
        ? !questReady
        : !journeyComplete && !wasVisited;
      beacon.visited.enabled = isQuestTarget
        ? false
        : !journeyComplete && wasVisited;
      beacon.complete.enabled = isQuestTarget ? questReady : journeyComplete;

      if (beacon.light.light) {
        const targetIntensity = isQuestTarget
          ? questReady
            ? 1.02 + pulse * 0.36
            : 0.72 + pulse * 0.3
          : journeyComplete
            ? 0.68 + pulse * 0.22 + celebrationStrength * 1.05
            : wasVisited
              ? 0.12
              : 0.31 + pulse * 0.09;
        beacon.light.light.intensity = pc.math.lerp(
          beacon.light.light.intensity,
          targetIntensity,
          Math.min(1, dt * 4.5),
        );
        beacon.light.light.color.copy(
          questReady
            ? journeyCompleteColor
            : isQuestTarget
              ? journeyWarmColor
              : journeyComplete
                ? journeyCompleteColor
                : wasVisited
                  ? journeyVisitedColor
                  : journeyWarmColor,
        );
      }
    });
    animateAvatar(playerAvatar, dt);
    const blend = 1 - Math.exp(-dt * 10);
    const listeningPartner = selectListeningPartner(
      presentedActivity,
      remoteEntities,
      (entry) => entry.targetPosition,
    );
    remoteEntities.forEach((entry, uid) => {
      const current = entry.root.getPosition();
      const listeningAnchor =
        uid === listeningPartner?.uid ? listeningPartner.anchor : null;
      entry.pose = listeningAnchor ? "listening" : null;
      const targetPosition = listeningAnchor ?? entry.targetPosition;
      entry.root.setPosition(
        pc.math.lerp(current.x, targetPosition.x, blend),
        pc.math.lerp(current.y, targetPosition.y, blend),
        pc.math.lerp(current.z, targetPosition.z, blend),
      );
      const currentHeading = entry.root.getEulerAngles().y;
      const targetHeading = listeningAnchor?.heading ?? entry.targetHeading;
      const headingDelta =
        ((targetHeading - currentHeading + 540) % 360) - 180;
      entry.root.setEulerAngles(0, currentHeading + headingDelta * blend, 0);
      animateAvatar(entry, dt);
    });
  });

  return {
    player,
    camera,
    ready,
    marketReady,
    gardenReady,
    avatarReady,
    environmentReady,
    getAudioAnchorPositions(name) {
      if (!name.startsWith("SFX_")) return [];
      const positions: Array<{ x: number; y: number; z: number }> = [];
      const visit = (entity: pc.Entity) => {
        if (entity.name === name) {
          const position = entity.getPosition();
          positions.push({ x: position.x, y: position.y, z: position.z });
        }
        (entity.children as pc.Entity[]).forEach(visit);
      };
      visit(app.root);
      return positions;
    },
    setPlayerActivityPose(pose) {
      playerAvatar.pose = pose;
    },
    setActivityState(activity) {
      presentedActivity = activity;
      activityFeedbackClock = 0;
      activityFeedback.forEach((feedback) => {
        const active = activity?.id === feedback.id;
        feedback.root.enabled = active;
        if (!active && feedback.light.light) {
          feedback.light.light.intensity = 0;
        }
      });
    },
    setJourneyState(journey) {
      const wasComplete = journeyComplete;
      journeyVisited = new Set(journey.visited);
      journeyComplete = journey.complete;
      if (journeyComplete && !wasComplete) journeyCelebration = 4;
      if (!journeyComplete) journeyCelebration = 0;
    },
    setQuestState(quest) {
      questState = quest;
      if (quest) {
        document.documentElement.dataset.questTarget = quest.targetLandmarkId;
        document.documentElement.dataset.questStatus = quest.status;
      } else {
        delete document.documentElement.dataset.questTarget;
        delete document.documentElement.dataset.questStatus;
      }
    },
    setPublicEventState(publicEvent) {
      const newlyCompleted = Boolean(
        publicEvent?.phase === "completed" &&
          (publicEventState?.phase !== "completed" ||
            publicEventState.instanceId !== publicEvent.instanceId),
      );
      publicEventState = publicEvent;
      if (newlyCompleted) relayCelebration = 4;
      else if (publicEvent?.phase !== "completed") relayCelebration = 0;

      relayBeacons.forEach((beacon) => {
        beacon.root.enabled = publicEvent !== null;
        if (!publicEvent && beacon.light.light) {
          beacon.light.light.intensity = 0;
        }
      });
      if (publicEvent) {
        document.documentElement.dataset.publicEvent = publicEvent.id;
        document.documentElement.dataset.publicEventPhase = publicEvent.phase;
      } else {
        delete document.documentElement.dataset.publicEvent;
        delete document.documentElement.dataset.publicEventPhase;
      }
    },
    setExpeditionState(expedition) {
      const newlyCompleted = Boolean(
        expedition.status === "completed" &&
          (expeditionState?.status !== "completed" ||
            expeditionState.instanceId !== expedition.instanceId),
      );
      expeditionState = expedition;
      expeditionServerOffset = expedition.serverNow - Date.now();
      if (newlyCompleted) expeditionCelebration = 5;
      else if (expedition.status !== "completed") expeditionCelebration = 0;

      if (expedition.status !== "idle") {
        document.documentElement.dataset.expedition = expedition.id;
        document.documentElement.dataset.expeditionStatus = expedition.status;
        if (expedition.stageId) {
          document.documentElement.dataset.expeditionStage = expedition.stageId;
        } else {
          delete document.documentElement.dataset.expeditionStage;
        }
      } else {
        delete document.documentElement.dataset.expedition;
        delete document.documentElement.dataset.expeditionStatus;
        delete document.documentElement.dataset.expeditionStage;
      }
    },
    pickRemotePlayer(screenX, screenY, radius = 48) {
      if (!camera.camera) return null;
      let closestUid: string | null = null;
      let closestDistance = radius;
      remoteEntities.forEach(({ root }, uid) => {
        remoteCenter.copy(root.getPosition());
        remoteCenter.y += 1;
        cameraToRemote.sub2(remoteCenter, camera.getPosition());
        if (
          camera.forward.dot(cameraToRemote) <= 0 ||
          cameraToRemote.length() > 24
        )
          return;
        camera.camera!.worldToScreen(remoteCenter, projectedRemote);
        const distance = Math.hypot(
          projectedRemote.x - screenX,
          projectedRemote.y - screenY,
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestUid = uid;
        }
      });
      return closestUid;
    },
    setPlayerAppearance(color, appearance) {
      applyAvatarAppearance(playerAvatar, color, appearance);
    },
    setRemotePlayers(players) {
      const active = new Set(players.map((remote) => remote.uid));
      remoteEntities.forEach(({ root }, uid) => {
        if (!active.has(uid)) {
          root.destroy();
          remoteEntities.delete(uid);
        }
      });

      players.forEach((remote) => {
        let remoteEntry = remoteEntities.get(remote.uid);
        if (!remoteEntry) {
          const material = makeMaterial(
            `Remote ${remote.uid}`,
            new pc.Color().fromString(remote.color),
          );
          remoteEntry = avatar(app, `Remote ${remote.uid}`, material, [
            remote.x,
            avatarRootHeight(remote.z),
            remote.z,
          ]);
          applyAvatarAppearance(
            remoteEntry,
            remote.color,
            remote.appearance,
          );
          remoteEntry.targetHeading = ((remote.heading ?? 0) * 180) / Math.PI;
          remoteEntry.root.setEulerAngles(0, remoteEntry.targetHeading, 0);
          if (authoredAvatarContainer) {
            try {
              attachAuthoredAvatar(remoteEntry, authoredAvatarContainer);
            } catch (error) {
              console.warn(
                "A remote authored avatar could not be installed; keeping its fallback.",
                error,
              );
            }
          }
          remoteEntities.set(remote.uid, remoteEntry);
        }
        if (
          remoteEntry.color !== remote.color ||
          remoteEntry.appearanceKey !== avatarAppearanceKey(remote.appearance)
        ) {
          applyAvatarAppearance(
            remoteEntry,
            remote.color,
            remote.appearance,
          );
        }
        remoteEntry.targetPosition.set(
          remote.x,
          avatarRootHeight(remote.z),
          remote.z,
        );
        remoteEntry.targetHeading = ((remote.heading ?? 0) * 180) / Math.PI;
      });
    },
  };
}
